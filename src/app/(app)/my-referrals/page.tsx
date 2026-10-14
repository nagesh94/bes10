import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelPartners, commissions, contacts, projects } from "@/lib/db/schema";
import { hasRole } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * A partner's own referrals and earnings.
 *
 * Scoped by the partner id on the actor, in the query. A partner sees their
 * own rows and nothing else — no other partner's, no project costs, no
 * margins. The consumer's name and the plant size are shown because the
 * partner introduced them and already knows both; nothing further is.
 */
const STATUS_LABEL: Record<string, { label: string; tone: string; note: string }> = {
  ACCRUED: {
    label: "Earned",
    tone: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
    note: "The job is commissioned and this is yours",
  },
  DUE: {
    label: "Approved",
    tone: "bg-[var(--navy-soft)] text-[var(--navy)]",
    note: "Approved for payment",
  },
  PAID: {
    label: "Paid",
    tone: "bg-[var(--green-soft)] text-[var(--green-text)]",
    note: "Sent",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "bg-[var(--chip-soft)] text-[var(--muted)]",
    note: "",
  },
};

export default async function MyReferralsPage() {
  const actor = await getActor();
  if (!actor) notFound();
  if (!hasRole(actor, "PARTNER") || !actor.partnerId) notFound();

  const [partner] = await db
    .select()
    .from(channelPartners)
    .where(eq(channelPartners.id, actor.partnerId))
    .limit(1);
  if (!partner) notFound();

  const rows = await db
    .select({ commission: commissions, project: projects, contact: contacts })
    .from(commissions)
    .innerJoin(projects, eq(commissions.projectId, projects.id))
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(commissions.partnerId, actor.partnerId))
    .orderBy(desc(commissions.accruedAt));

  const referred = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.referredByPartnerId, actor.partnerId));

  const sum = (status: string) =>
    rows.filter((r) => r.commission.status === status).reduce((n, r) => n + Number(r.commission.amount), 0);

  const totals = [
    ["Earned", sum("ACCRUED"), "var(--amber-text)"],
    ["Approved", sum("DUE"), "var(--navy)"],
    ["Paid", sum("PAID"), "var(--green-text)"],
  ] as const;

  const rate = Number(partner.commissionRate ?? 0);
  const settled = new Set(
    rows.filter((r) => r.commission.status !== "CANCELLED").map((r) => r.project.id),
  );
  const inProgress = referred.filter((r) => !settled.has(r.project.id));

  return (
    <main className="mx-auto max-w-[900px] px-6 pt-5 pb-14">
      <div className="mb-5">
        <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">My referrals</h1>
        <p className="text-sm text-[var(--muted)]">
          {partner.name}
          {rate > 0
            ? ` · ₹${rate.toLocaleString("en-IN")} ${
                partner.commissionBasis === "PER_KW" ? "per kW" : "per project"
              }`
            : ""}
        </p>
      </div>

      <div className="mb-4.5 flex flex-wrap gap-3">
        {totals.map(([label, value, colour]) => (
          <div
            key={label}
            className="min-w-36 flex-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4"
          >
            <div className="mb-1 text-[12px] font-semibold text-[var(--muted)]">
              {label}
            </div>
            <div className="ref text-[22px] font-bold" style={{ color: colour }}>
              &#8377;{value.toLocaleString("en-IN")}
            </div>
          </div>
        ))}
      </div>

      {inProgress.length > 0 ? (
        <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <h2 className="mb-0.5 text-base font-bold">Still in progress</h2>
          <p className="mb-3.5 text-[13px] text-[var(--muted)]">
            A referral earns once the system is commissioned.
          </p>
          <div className="space-y-2">
            {inProgress.map((r) => (
              <div
                key={r.project.id}
                className="flex flex-wrap items-center gap-3 rounded-[9px] bg-[var(--surface-2)] px-4 py-3"
              >
                <span className="ref flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--chip-soft)] text-[11.5px] font-bold text-[var(--muted)]">
                  {r.project.pipelineStage}
                </span>
                <span className="min-w-32 flex-1 text-[13.5px] font-semibold">
                  {r.contact.firstName} {r.contact.lastName ?? ""}
                </span>
                <span className="text-[12px] text-[var(--muted)]">
                  stage {r.project.pipelineStage} of 9
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-3.5 text-base font-bold">Earnings</h2>
        {rows.length === 0 ? (
          <p className="rounded-[9px] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
            Nothing earned yet. Your first commission appears here once a referral is commissioned.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[9px] border border-[var(--line)]">
            {rows.map((r, i) => {
              const meta = STATUS_LABEL[r.commission.status] ?? STATUS_LABEL.ACCRUED!;
              return (
                <div
                  key={r.commission.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 ${
                    i < rows.length - 1 ? "border-b border-[var(--line-soft)]" : ""
                  }`}
                >
                  <span className="min-w-36 flex-1">
                    <span className="block text-[13.5px] font-semibold">
                      {r.contact.firstName} {r.contact.lastName ?? ""}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">
                      {r.commission.basis === "PER_KW"
                        ? `${r.commission.plantKw ?? "?"} kW`
                        : "Flat fee"}
                      {meta.note ? ` · ${meta.note}` : ""}
                    </span>
                  </span>
                  <span className="ref shrink-0 text-[15px] font-bold">
                    &#8377;{Number(r.commission.amount).toLocaleString("en-IN")}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
