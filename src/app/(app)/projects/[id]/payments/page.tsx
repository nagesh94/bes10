import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, documents as documentsTable, projects } from "@/lib/db/schema";
import {
  FinanceForm,
  GiveMoneyForm,
  PaymentPlanForm,
  RecordPaymentForm,
} from "@/components/payments/payment-plan-form";
import { UploadSlot } from "@/components/documents/upload-slot";
import { getMoneyView } from "@/app/actions/payments";
import { RECEIVED_MODE_LABELS, TRIGGER_SHORT, type ReceivedMode } from "@/lib/payments/schedule";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";
import { involvesFinance } from "@/lib/workflow/stages";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function LockChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--locked-soft)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.06em] text-[var(--locked-text)] uppercase">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 018 0v3" />
      </svg>
      Admin only
    </span>
  );
}

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();

  // This is an admin-only route, not a page with fields hidden. An employee
  // never reaches the query at all.
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  // The Jan Samarth paper. It is uploaded with the documents too — this is
  // the second door, for whoever is already on this page when the loan
  // clears. The newest row of its type wins, as everywhere else.
  const loanDocs = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const latest = (docType: string) =>
    loanDocs
      .filter((d) => d.docType === docType)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
  const existingDoc = (docType: string) => {
    const doc = latest(docType);
    return doc
      ? {
          id: doc.id,
          fileName: doc.fileName,
          sizeBytes: doc.sizeBytes,
          uploadedAt: doc.uploadedAt,
          hasPortal: Boolean(doc.s3KeyPortal),
        }
      : null;
  };

  const view = await getMoneyView(id);
  const { plan, milestones, received, advances, finance, subsidy, totalReceived, totalGiven, outstanding } =
    view;

  const totalValue = plan?.totalValue ? Number(plan.totalValue) : 0;
  const collectible = totalValue + totalGiven;
  const pct = collectible > 0 ? Math.min(Math.round((totalReceived / collectible) * 100), 100) : 0;
  const showFinance = involvesFinance(plan?.mode ?? null);
  const subsidyExpected = subsidy?.expectedAmount ? Number(subsidy.expectedAmount) : 0;

  return (
    <StageShell
      projectId={id}
      stageNo={null}
      title="Payment plan"
      note="Employees and installers never see this page."
      badge={<LockChip />}
    >

      <div className="flex flex-wrap items-start gap-4.5">
        <div className="min-w-0 flex-[999_1_560px] space-y-4.5">
          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <h2 className="mb-4 text-base font-bold">How is the customer paying?</h2>
            <PaymentPlanForm
              projectId={id}
              initial={{
                mode: (plan?.mode ?? "CASH") as "CASH" | "FINANCE" | "SPLIT",
                totalValue: plan?.totalValue ?? "",
                cashComponent: plan?.cashComponent ?? "",
                financeComponent: plan?.financeComponent ?? "",
                milestones: milestones.map((m) => ({
                  amount: m.amount,
                  trigger: m.trigger,
                })),
              }}
            />
          </section>

          {showFinance ? (
            <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <h2 className="flex-1 text-base font-bold">Finance — Jan Samarth</h2>
              </div>
              <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
                The loan is applied for on Jan Samarth, not here. The digital approval letter the
                portal issues can be filed from the documents side too, which an employee can do
                without seeing the amount below. The money itself arrives in two parts, PSS1 and
                PSS2 — record each one as it lands.
              </p>
              <a
                href="https://www.jansamarth.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4.5 flex items-center gap-3 rounded-[9px] bg-[var(--navy)] px-4 py-3.5 text-[var(--navy-ink)] no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">Open Jan Samarth</span>
                  <span className="ref mt-0.5 block text-[11.5px] opacity-75">
                    jansamarth.in · opens in a new tab
                  </span>
                </span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-9 9" />
                  <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
                </svg>
              </a>
              <FinanceForm
                projectId={id}
                initial={{
                  bankName: finance?.bankName ?? "",
                  loanAmount: finance?.loanAmount ?? "",
                  status: finance?.status ?? "NOT_APPLIED",
                }}
              />

              <div className="mt-5 space-y-2.5 border-t border-[var(--line-soft)] pt-4.5">
                <h3 className="text-[13.5px] font-bold">Paper from the portal</h3>
                <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
                  Jan Samarth hands this out as a download. It lives nowhere but that login unless
                  it is filed here, so upload it as it comes.
                </p>
                <UploadSlot
                  projectId={id}
                  docType="DIGITAL_APPROVAL_LETTER"
                  label="Digital approval letter"
                  hint="Downloaded from Jan Samarth once the loan clears"
                  existing={existingDoc("DIGITAL_APPROVAL_LETTER")}
                  canDelete={canDeleteDocs}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-5">
              <h2 className="mb-1 text-base font-bold text-[var(--muted)]">Finance</h2>
              <p className="text-[13px] text-[var(--muted)]">
                This is a cash project, so there is no Jan Samarth application, no digital approval
                letter and no bank loan pack. Switch the mode above if that changes.
              </p>
            </section>
          )}

          {received.length ? (
            <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
              <h2 className="border-b border-[var(--line)] px-6 py-4 text-base font-bold">
                Payments received
              </h2>
              {received.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-6 py-3.5">
                  <span className="ref min-w-28 flex-1 text-sm font-semibold">
                    {inr(Number(r.amount))}
                  </span>
                  <span className="text-[13px] text-[var(--muted)]">
                    {RECEIVED_MODE_LABELS[r.mode as ReceivedMode] ?? r.mode}
                  </span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{r.referenceNo ?? "—"}</span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{r.receivedOn}</span>
                </div>
              ))}
            </section>
          ) : null}

          {advances.length ? (
            <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
              <div className="border-b border-[var(--line)] px-6 py-4">
                <h2 className="text-base font-bold">Given to the customer</h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                  Recoverable, so every line here is added to what the project owes.
                </p>
              </div>
              {advances.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-6 py-3.5">
                  <span className="ref min-w-28 text-sm font-semibold text-[var(--red-text)]">
                    − {inr(Number(a.amount))}
                  </span>
                  <span className="min-w-32 flex-1 text-[13px] text-[var(--muted)]">
                    {a.note ?? RECEIVED_MODE_LABELS[a.mode as ReceivedMode] ?? a.mode}
                  </span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{a.referenceNo ?? "—"}</span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{a.paidOn}</span>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="min-w-72 flex-[1_1_320px] space-y-4.5">
          <section className="rounded-[var(--radius)] bg-[var(--navy)] px-6 py-5 text-[var(--navy-ink)]">
            <h2 className="mb-4 text-[15px] font-bold opacity-80">
              Where the money is
            </h2>
            {[
              ["Project value", inr(totalValue)],
              ...(totalGiven ? [["Given to the customer", `+ ${inr(totalGiven)}`]] : []),
              ["Received", inr(totalReceived)],
              ...(subsidyExpected ? [["Subsidy expected", `− ${inr(subsidyExpected)}`]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-2">
                <span className="text-[13px] opacity-75">{k}</span>
                <span className="ref text-[15px] font-medium">{v}</span>
              </div>
            ))}
            <div className="mt-2 flex items-baseline justify-between border-t border-white/15 pt-3.5">
              <span className="text-sm font-semibold">Outstanding</span>
              <span className="ref text-[22px] font-semibold text-[var(--orange-text)]">
                {inr(outstanding)}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-[var(--green)]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed opacity-70">
              The subsidy is credited to the customer&rsquo;s own account, not to BHIM — it reduces
              what they are out of pocket, never what they owe us. Money we hand them does the
              opposite: it is owed back on top of the project value.
            </p>
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
            <h2 className="mb-3.5 text-sm font-bold">Record a payment</h2>
            <RecordPaymentForm
              projectId={id}
              milestones={milestones.map((m) => ({
                id: m.id,
                label: `${TRIGGER_SHORT[m.trigger]} · ${inr(Number(m.amount))}`,
              }))}
            />
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
            <h2 className="mb-1 text-sm font-bold">Money the other way</h2>
            <p className="mb-3.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              A fee paid on their behalf, or cash fronted against a subsidy that has not landed.
              It is not a discount — it goes on to the outstanding figure until it comes back.
            </p>
            <GiveMoneyForm projectId={id} />
          </section>
        </aside>
      </div>
    </StageShell>
  );
}
