import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getMoneyView } from "@/app/actions/payments";
import { FinalPayment, SubsidyForm } from "@/components/money/settlement";
import { db } from "@/lib/db";
import { channelPartners, commissions, contacts, projects } from "@/lib/db/schema";
import { canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

const day = (v: string | Date | null | undefined) => {
  if (!v) return "";
  const d = typeof v === "string" ? v : v.toISOString();
  return d.slice(0, 10);
};

/**
 * Stage 9 — settlement.
 *
 * Admin-only, because every number on it is money. This is the last thing
 * that happens: the subsidy lands in the consumer's account, the balance
 * clears, the referrer is paid, and the project closes.
 */
export default async function Stage9Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  const money = await getMoneyView(id);

  const commissionRows = await db
    .select({ commission: commissions, partner: channelPartners })
    .from(commissions)
    .innerJoin(channelPartners, eq(commissions.partnerId, channelPartners.id))
    .where(eq(commissions.projectId, id));

  const subsidyReceived = money.subsidy?.status === "RECEIVED";
  const cleared = money.outstanding <= 0;
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const tiles: Array<[string, string, string]> = [
    ["Project value", inr(Number(money.plan?.totalValue ?? 0)), "var(--ink)"],
    ["Received", inr(money.totalReceived), "var(--green-text)"],
    [
      "Outstanding",
      inr(money.outstanding),
      money.outstanding > 0 ? "var(--red-text)" : "var(--green-text)",
    ],
    [
      "Subsidy",
      inr(Number(money.subsidy?.receivedAmount ?? money.subsidy?.expectedAmount ?? 0)),
      subsidyReceived ? "var(--green-text)" : "var(--amber-text)",
    ],
  ];

  return (
    <main className="mx-auto max-w-[1100px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/projects" className="no-underline">Projects</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <Link href={`/projects/${id}`} className="ref no-underline">{row.project.code}</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span>Stage 9</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Settlement</h1>
          <p className="text-sm text-[var(--muted)]">
            {row.contact.firstName} {row.contact.lastName ?? ""} · the last of the money, then the
            project closes.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--orange-soft)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--orange-text)]">
          Admin only
        </span>
      </div>

      <div className="mb-4.5 flex flex-wrap gap-3">
        {tiles.map(([label, value, colour]) => (
          <div
            key={label}
            className="min-w-36 flex-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4"
          >
            <div className="mb-1 text-[12px] font-semibold text-[var(--muted)]">
              {label}
            </div>
            <div className="ref text-[20px] font-bold" style={{ color: colour }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4.5 flex flex-wrap gap-4.5">
        <section className="min-w-80 flex-[1_1_420px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <SubsidyForm
            projectId={id}
            initial={{
              status: money.subsidy?.status ?? "NOT_APPLIED",
              expectedAmount: money.subsidy?.expectedAmount ?? "",
              receivedAmount: money.subsidy?.receivedAmount ?? "",
              receivedOn: day(money.subsidy?.receivedOn),
            }}
          />
        </section>

        <section className="min-w-80 flex-[1_1_420px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <FinalPayment projectId={id} outstanding={money.outstanding} />
        </section>
      </div>

      {commissionRows.length > 0 ? (
        <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <h2 className="mb-0.5 text-base font-bold">Referral commission</h2>
          <p className="mb-3.5 text-[13px] text-[var(--muted)]">
            Paid from the Channel partners page, where the whole ledger lives.
          </p>
          {commissionRows.map((c) => (
            <div
              key={c.commission.id}
              className="flex flex-wrap items-center gap-3 rounded-[9px] bg-[var(--surface-2)] px-4 py-3"
            >
              <span className="min-w-32 flex-1 text-[13.5px] font-semibold">{c.partner.name}</span>
              <span className="ref text-[14px] font-bold">
                {inr(Number(c.commission.amount))}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase ${
                  c.commission.status === "PAID"
                    ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                    : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
                }`}
              >
                {c.commission.status}
              </span>
              <Link
                href="/partners"
                className="h-9 shrink-0 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] leading-[2.1] font-bold text-[var(--navy)] no-underline"
              >
                Open ledger
              </Link>
            </div>
          ))}
        </section>
      ) : null}

      <section
        className={`rounded-[var(--radius)] border px-6 py-5 ${
          subsidyReceived && cleared
            ? "border-[var(--green-border)] bg-[var(--green-soft)]"
            : "border-[var(--line)] bg-[var(--surface)]"
        }`}
      >
        <h2 className="mb-2 text-base font-bold">Ready to close?</h2>
        <ul className="mb-3 space-y-1.5">
          {[
            [
              "Subsidy received",
              subsidyReceived,
              money.subsidy?.status ? `currently ${money.subsidy.status.toLowerCase()}` : "not applied",
            ],
            ["Balance cleared", cleared, cleared ? "nothing outstanding" : `${inr(money.outstanding)} to come`],
          ].map(([label, done, detail]) => (
            <li key={String(label)} className="flex items-center gap-2.5 text-[13.5px]">
              <span
                className={`ref flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  done
                    ? "bg-[var(--green)] text-white"
                    : "bg-[var(--chip-soft)] text-[var(--muted-soft)]"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <span className="font-semibold">{String(label)}</span>
              <span className="text-[12px] text-[var(--muted)]">{String(detail)}</span>
            </li>
          ))}
        </ul>
        <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--muted)]">
          Closing is done from the stage gate, which is also where an admin can override if a
          project has to close with something still open.
        </p>
        <Link
          href={`/projects/${id}`}
          className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
        >
          Back to the stage gate
        </Link>
      </section>
    </main>
  );
}
