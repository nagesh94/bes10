import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contacts,
  paymentMilestones,
  paymentPlans,
  projects,
  quotationMilestones,
  quotations,
} from "@/lib/db/schema";
import {
  apportion,
  type AgreementFormValues,
  type AgreementMilestoneDraft,
  type ValueSource,
} from "./form-values";

/**
 * What a new agreement starts out saying, given a project.
 *
 * The order is the order of authority. A **locked payment plan** is the
 * figure the admin has settled, so it wins. Failing that the project's
 * **chosen quotation** is the price the customer was actually offered and
 * usually accepted. Failing both, the parties are filled in and the cost is
 * left to be typed — which is the whole point of the change: the office can
 * draw up a draft for someone sitting in front of them without waiting for
 * an admin to lock a plan.
 *
 * Nothing here is binding. Every field it fills stays editable on the form,
 * because the number in clause 19.1 is agreed in conversation and the paper
 * has to be able to say what was agreed.
 */

/**
 * A quotation's payment row as a rupee figure.
 *
 * `quotation_milestones.schedule` is free text that prints verbatim — "10%"
 * on nearly every one the office sends, but "On order" and plain figures
 * appear too. A percentage is resolved against the total; a bare number is
 * taken as rupees; anything else has no figure and the caller apportions
 * the standard split instead.
 */
function amountFromSchedule(schedule: string, total: number): number | null {
  const text = schedule.trim();

  const percent = /^(\d+(?:\.\d+)?)\s*%$/.exec(text);
  if (percent) return Math.round((total * Number(percent[1])) / 100);

  const figure = Number(text.replace(/[rs.,\s₹]/gi, ""));
  return Number.isFinite(figure) && figure > 0 ? Math.round(figure) : null;
}

export interface AgreementPrefill {
  values: AgreementFormValues;
  projectCode: string | null;
  /** Said plainly on the form, so nobody wonders where the figure came from. */
  source: ValueSource;
  /** Null when the project itself is gone. */
  found: boolean;
  /**
   * Whether the contact has a street address, not merely a PIN code.
   *
   * `consumerAddress` joins the two, so a contact with a PIN and nothing
   * else still produces a non-empty string — and the agreement would recite
   * "having address at 460001", which is not an address. A person looking
   * at the form catches that; the Stage 1 button generating unattended does
   * not, so it asks this instead of trusting the joined string.
   */
  addressLineKnown: boolean;
}

export async function prefillFromProject(
  projectId: string,
  base: AgreementFormValues,
): Promise<AgreementPrefill> {
  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!row) {
    return {
      values: base,
      projectCode: null,
      source: "typed",
      found: false,
      addressLineKnown: false,
    };
  }

  const addressLineKnown = Boolean((row.contact.address ?? "").trim());

  const values: AgreementFormValues = { ...base, projectId };
  const gender = (row.contact.gender ?? "").toLowerCase();

  values.consumerTitle = gender === "female" ? "Mrs." : gender === "male" ? "Mr." : "";
  values.consumerName = [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ");
  values.consumerAddress = [row.contact.address, row.contact.pinCode].filter(Boolean).join(", ");

  // ── The locked plan, if there is one ──
  const [plan] = await db
    .select()
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);

  if (plan?.lockedAt && Number(plan.totalValue) > 0) {
    const milestones = await db
      .select()
      .from(paymentMilestones)
      .where(eq(paymentMilestones.projectId, projectId))
      .orderBy(asc(paymentMilestones.sortOrder));

    if (milestones.length > 0) {
      values.totalValue = String(Number(plan.totalValue));
      values.valueSource = "plan";
      values.milestones = milestones.map((m) => ({
        label: m.label,
        amount: String(Number(m.amount)),
      }));
      return {
        values,
        projectCode: row.project.code,
        source: "plan",
        found: true,
        addressLineKnown,
      };
    }
  }

  // ── Otherwise the chosen quotation ──
  const [quotation] = await db
    .select({
      id: quotations.id,
      totalAmount: quotations.totalAmount,
    })
    .from(quotations)
    .where(and(eq(quotations.projectId, projectId), eq(quotations.isChosen, true)))
    .limit(1);

  if (quotation && Number(quotation.totalAmount) > 0) {
    const total = Number(quotation.totalAmount);
    const rows = await db
      .select()
      .from(quotationMilestones)
      .where(eq(quotationMilestones.quotationId, quotation.id))
      .orderBy(asc(quotationMilestones.sortOrder));

    const converted: AgreementMilestoneDraft[] = [];
    for (const m of rows) {
      const amount = amountFromSchedule(m.schedule, total);
      if (amount === null) break;
      converted.push({ label: m.label, amount: String(amount) });
    }

    values.totalValue = String(total);
    values.valueSource = "quotation";
    // All or nothing: a half-converted schedule with three figures and a
    // blank is worse than the standard split, which at least adds up.
    values.milestones = converted.length === rows.length && rows.length > 0
      ? converted
      : apportion(total);

    return {
      values,
      projectCode: row.project.code,
      source: "quotation",
      found: true,
      addressLineKnown,
    };
  }

  // ── Neither. The parties are filled; the cost is typed. ──
  return {
    values,
    projectCode: row.project.code,
    source: "typed",
    found: true,
    addressLineKnown,
  };
}
