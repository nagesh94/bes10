import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyBranches, contacts, projects, rooftopDetails } from "@/lib/db/schema";
import { QuotationForm } from "@/components/quotations/quotation-form";
import { emptyQuotation } from "@/lib/quotations/form-values";
import { quotationMasterOptions } from "@/lib/quotations/master";
import { peekQuotationNumber } from "@/lib/quotations/number";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * A new quotation, either blank or pre-filled from a project.
 *
 * `?project=<id>` is the only difference between the two routes the user
 * described: from inside a project the consumer block arrives filled, and
 * from the Quotations tab it does not. Everything after that is the same
 * form, which is why there is one page rather than two.
 */
export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "quotation.write")) notFound();

  const { project: projectId } = await searchParams;

  const [master, nextNumber, branches] = await Promise.all([
    quotationMasterOptions(),
    peekQuotationNumber(db),
    db.select().from(companyBranches).where(eq(companyBranches.isDefault, true)).limit(1),
  ]);

  const branch = branches[0];

  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  const initial = emptyQuotation(todayValue);
  let projectCode: string | null = null;

  if (projectId) {
    const [row] = await db
      .select({ project: projects, contact: contacts })
      .from(projects)
      .innerJoin(contacts, eq(projects.contactId, contacts.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    if (row) {
      const gender = (row.contact.gender ?? "").toLowerCase();
      projectCode = row.project.code;
      initial.projectId = projectId;
      initial.consumerTitle = gender === "female" ? "Mrs." : gender === "male" ? "Mr." : "";
      initial.consumerName = [row.contact.firstName, row.contact.lastName]
        .filter(Boolean)
        .join(" ");
      initial.consumerAddress = [row.contact.address, row.contact.pinCode]
        .filter(Boolean)
        .join(", ");
      initial.consumerPhone = row.contact.phone;
      // The surveyed plant size if stage 1 has been filled, otherwise what
      // they asked about on the phone. Both are a starting figure that the
      // person quoting can overwrite — but the designed size is the better
      // guess once it exists, and it is what the rest of the project prints.
      const [rooftop] = await db
        .select({ plantKw: rooftopDetails.plantKw })
        .from(rooftopDetails)
        .where(eq(rooftopDetails.projectId, projectId))
        .limit(1);

      initial.capacityKwp = rooftop?.plantKw
        ? String(Number(rooftop.plantKw))
        : (row.project.interestedPlantKw ?? "").replace(/[^\d.]/g, "");
    }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 pt-7 pb-14">
      <div className="mb-5">
        <Link
          href={projectId ? `/projects/${projectId}` : "/quotations"}
          className="mb-3 inline-block text-[13px] font-semibold text-[var(--link)] no-underline"
        >
          ← {projectId && projectCode ? projectCode : "Quotations"}
        </Link>
        <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">New quotation</h1>
        <p className="text-sm text-[var(--muted)]">
          This one will be <span className="ref font-semibold text-[var(--ink)]">{nextNumber}</span>
          {projectCode ? ` — filled from ${projectCode}.` : " — not linked to any project."}
        </p>
      </div>

      {!branch ? (
        <p className="rounded-[var(--radius)] border border-[var(--red-border)] bg-[var(--red-surface)] px-4 py-3.5 text-[13.5px] font-medium text-[var(--red-text)]">
          No company branch is set up, so there is no letterhead to print. Add one under Admin
          first.
        </p>
      ) : (
        <>
          {!branch.bankName ? (
            <p className="mb-5 rounded-[var(--radius)] border border-[var(--orange-border,var(--line))] bg-[var(--orange-soft)] px-4 py-3 text-[13px] text-[var(--orange-text)]">
              The {branch.name} branch has no bank details on record, so this quotation will
              print without the Bank Details block.
            </p>
          ) : null}
          <QuotationForm
            mode="create"
            initial={initial}
            master={master}
            projectCode={projectCode}
          />
        </>
      )}
    </main>
  );
}
