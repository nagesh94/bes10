import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  AccrueButton,
  CommissionList,
  PartnerCard,
  PartnerForm,
  type CommissionRow,
  type PartnerRow,
} from "@/components/partners/partner-admin";
import { db } from "@/lib/db";
import { channelPartners, commissions, contacts, projects } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Channel partners and what they are owed.
 *
 * Admin-only, because every figure on it is money. A partner with a login of
 * their own sees `/my-referrals` instead, which shows their own rows and no
 * one else's.
 */
export default async function PartnersPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "partner.read")) notFound();

  const partners = await db
    .select()
    .from(channelPartners)
    .orderBy(desc(channelPartners.active), channelPartners.name);

  const commissionRows = await db
    .select({ commission: commissions, project: projects, contact: contacts })
    .from(commissions)
    .innerJoin(projects, eq(commissions.projectId, projects.id))
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .orderBy(desc(commissions.accruedAt));

  const byPartner = new Map<string, { accrued: number; due: number; paid: number; n: number }>();
  for (const r of commissionRows) {
    const t = byPartner.get(r.commission.partnerId) ?? { accrued: 0, due: 0, paid: 0, n: 0 };
    const amount = Number(r.commission.amount);
    if (r.commission.status === "ACCRUED") t.accrued += amount;
    if (r.commission.status === "DUE") t.due += amount;
    if (r.commission.status === "PAID") t.paid += amount;
    if (r.commission.status !== "CANCELLED") t.n += 1;
    byPartner.set(r.commission.partnerId, t);
  }

  const partnerName = new Map(partners.map((p) => [p.id, p.name]));

  const rows: PartnerRow[] = partners.map((p) => {
    const t = byPartner.get(p.id) ?? { accrued: 0, due: 0, paid: 0, n: 0 };
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      email: p.email,
      address: p.address,
      panNumber: p.panNumber,
      bankAccountNumber: p.bankAccountNumber,
      ifscCode: p.ifscCode,
      upiId: p.upiId,
      commissionBasis: p.commissionBasis,
      commissionRate: p.commissionRate,
      notes: p.notes,
      active: p.active,
      referrals: t.n,
      accrued: t.accrued,
      due: t.due,
      paid: t.paid,
    };
  });

  const list: CommissionRow[] = commissionRows.map((r) => ({
    id: r.commission.id,
    partnerName: partnerName.get(r.commission.partnerId) ?? "Unknown partner",
    projectId: r.project.id,
    projectCode: r.project.code,
    consumer: `${r.contact.firstName} ${r.contact.lastName ?? ""}`.trim(),
    status: r.commission.status,
    amount: Number(r.commission.amount),
    basis: r.commission.basis,
    rate: Number(r.commission.rate),
    plantKw: r.commission.plantKw,
    paidReference: r.commission.paidReference,
    cancelledReason: r.commission.cancelledReason,
  }));

  // Referred projects that have reached commissioning but have no commission
  // row yet — the one place accrual is started from.
  const accruedProjectIds = new Set(
    commissionRows.filter((r) => r.commission.status !== "CANCELLED").map((r) => r.project.id),
  );
  const awaiting = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id));
  const pending = awaiting.filter(
    (r) =>
      r.project.referredByPartnerId &&
      r.project.pipelineStage >= 8 &&
      !accruedProjectIds.has(r.project.id),
  );

  const outstanding = rows.reduce((n, r) => n + r.accrued + r.due, 0);

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Channel partners</h1>
          <p className="text-sm text-[var(--muted)]">
            The people who send work our way, and what they are owed for it.
          </p>
        </div>
        {outstanding > 0 ? (
          <span className="ref shrink-0 rounded-full bg-[var(--amber-soft)] px-3 py-1.5 text-[12px] font-bold text-[var(--amber-text)]">
            &#8377;{outstanding.toLocaleString("en-IN")} outstanding
          </span>
        ) : null}
      </div>

      {pending.length > 0 ? (
        <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <h2 className="mb-0.5 text-sm font-bold text-[var(--amber-text)]">
            {pending.length} referred {pending.length === 1 ? "project has" : "projects have"} reached
            commissioning
          </h2>
          <p className="mb-3 text-[13px] text-[var(--amber-body)]">
            A commission is earned once the job is commissioned. Accruing copies the partner&apos;s
            current rate onto the row, so later rate changes cannot rewrite it.
          </p>
          <div className="flex flex-wrap gap-2">
            {pending.map((r) => (
              <AccrueButton
                key={r.project.id}
                projectId={r.project.id}
                label={`Accrue ${r.project.code}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-0.5 text-base font-bold">Add a partner</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          A login is not required — most partners simply phone a name in.
        </p>
        <PartnerForm />
      </section>

      <section className="mb-4.5">
        <h2 className="mb-3 text-base font-bold">
          Partners{" "}
          <span className="ref text-[12.5px] font-semibold text-[var(--muted)]">
            {rows.length}
          </span>
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-10 text-center text-[13.5px] text-[var(--muted)]">
            No partners yet. Add the first one above.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((p) => (
              <PartnerCard key={p.id} partner={p} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-0.5 text-base font-bold">Commissions</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          Accrued when the job is commissioned, marked due when it is approved for payment, and
          paid with a reference so it can be traced later.
        </p>
        <CommissionList rows={list} />
      </section>
    </main>
  );
}
