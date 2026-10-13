"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  lockPaymentPlan,
  recordPayment,
  savePaymentPlan,
  saveFinance,
  type MilestoneInput,
} from "@/app/actions/payments";

type Mode = "CASH" | "FINANCE" | "SPLIT";

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

const TRIGGERS: Array<{ value: MilestoneInput["trigger"]; label: string }> = [
  { value: "UPFRONT", label: "Upfront" },
  { value: "ON_INSTALL", label: "On install" },
  { value: "ON_LOAN_DISBURSAL", label: "On loan disbursal" },
  { value: "POST_SUBSIDY", label: "After subsidy" },
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function PaymentPlanForm({
  projectId,
  locked,
  initial,
}: {
  projectId: string;
  locked: boolean;
  initial: {
    mode: Mode;
    totalValue: string;
    cashComponent: string;
    financeComponent: string;
    milestones: MilestoneInput[];
    finance: { bankName: string; loanAmount: string; status: string } | null;
  };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [total, setTotal] = useState(initial.totalValue);
  const [cash, setCash] = useState(initial.cashComponent);
  const [finance, setFinance] = useState(initial.financeComponent);
  const [milestones, setMilestones] = useState<MilestoneInput[]>(
    initial.milestones.length
      ? initial.milestones
      : [{ label: "Booking amount", amount: "", trigger: "UPFRONT" }],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const involvesFinance = mode === "FINANCE" || mode === "SPLIT";
  const num = (v: string) => Number(String(v).replace(/[,\s₹]/g, "")) || 0;
  const milestoneSum = milestones.reduce((s, m) => s + num(m.amount), 0);
  const componentSum = num(cash) + num(finance);
  const totalNum = num(total);

  function setMilestone(i: number, patch: Partial<MilestoneInput>) {
    setMilestones((list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await savePaymentPlan(projectId, {
      mode,
      totalValue: total,
      cashComponent: cash,
      financeComponent: involvesFinance ? finance : "0",
      milestones,
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  async function lock() {
    setPending(true);
    setError(null);
    const result = await lockPaymentPlan(projectId);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  if (locked) {
    return (
      <div className="rounded-lg border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-3.5">
        <p className="text-[13.5px] font-semibold text-[var(--green-text)]">
          This plan is locked. Stage 1 can close.
        </p>
        <p className="mt-1 text-[12.5px] text-[var(--muted)]">
          Editing it again needs an admin unlock with a written reason.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3">
        {(
          [
            ["CASH", "Cash", "Paid directly, in one or more instalments."],
            ["FINANCE", "Finance", "Entirely through a bank loan."],
            ["SPLIT", "Split", "Part cash, part loan. The common case."],
          ] as const
        ).map(([value, label, blurb]) => {
          const on = mode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(value)}
              className={`flex-[1_1_190px] cursor-pointer rounded-[10px] px-4 py-3.5 text-left ${
                on
                  ? "bg-[var(--orange-soft)] ring-[1.5px] ring-[var(--orange)]"
                  : "border border-[var(--line)] bg-[var(--surface)]"
              }`}
            >
              <span className="mb-1.5 flex items-center gap-2.5">
                <span
                  className={`block h-[17px] w-[17px] shrink-0 rounded-full bg-[var(--surface)] ${
                    on ? "border-[5px] border-[var(--orange)]" : "border-[1.5px] border-[var(--line)]"
                  }`}
                />
                <span className="text-[15px] font-bold">{label}</span>
              </span>
              <span className="block text-[12.5px] leading-snug text-[var(--muted)]">{blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <div>
          <label className={labelCls} htmlFor="total">Total project value</label>
          <input id="total" value={total} onChange={(e) => setTotal(e.target.value)} className={`${field} ref`} placeholder="3,10,000" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cash">Cash component</label>
          <input id="cash" value={cash} onChange={(e) => setCash(e.target.value)} className={`${field} ref`} />
        </div>
        {involvesFinance ? (
          <div>
            <label className={labelCls} htmlFor="fin">Finance component</label>
            <input id="fin" value={finance} onChange={(e) => setFinance(e.target.value)} className={`${field} ref`} />
          </div>
        ) : null}
      </div>

      {totalNum > 0 && Math.abs(componentSum - totalNum) > 1 ? (
        <p className="mb-4 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--amber-text)]">
          Cash and finance come to {inr(componentSum)} against a total of {inr(totalNum)}.
        </p>
      ) : null}

      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="flex-1 text-sm font-bold">Milestones</h3>
        <span className={`ref text-[12.5px] ${Math.abs(milestoneSum - totalNum) > 1 && totalNum > 0 ? "text-[var(--amber-text)]" : "text-[var(--muted)]"}`}>
          {inr(milestoneSum)} of {inr(totalNum)}
        </span>
      </div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">
        Each one is an expected inflow with a trigger. These are what actual payments reconcile
        against, and what fires the reminder once the subsidy lands.
      </p>

      <div className="mb-3 space-y-2.5">
        {milestones.map((m, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <div className="min-w-40 flex-[2_1_180px]">
              <label className={labelCls} htmlFor={`ml-${i}`}>Label</label>
              <input id={`ml-${i}`} value={m.label} onChange={(e) => setMilestone(i, { label: e.target.value })} className={field} />
            </div>
            <div className="min-w-32 flex-[1_1_130px]">
              <label className={labelCls} htmlFor={`ma-${i}`}>Amount</label>
              <input id={`ma-${i}`} value={m.amount} onChange={(e) => setMilestone(i, { amount: e.target.value })} className={`${field} ref`} />
            </div>
            <div className="min-w-40 flex-[1_1_160px]">
              <label className={labelCls} htmlFor={`mt-${i}`}>Trigger</label>
              <select id={`mt-${i}`} value={m.trigger} onChange={(e) => setMilestone(i, { trigger: e.target.value as MilestoneInput["trigger"] })} className={field}>
                {TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setMilestones((l) => l.filter((_, j) => j !== i))}
              aria-label="Remove this milestone"
              className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--red-text)]"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setMilestones((l) => [...l, { label: "", amount: "", trigger: "POST_SUBSIDY" }])}
        className="mb-5 h-11 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-bold text-[var(--navy)]"
      >
        + Add milestone
      </button>

      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : saved ? (
        <p className="mb-4 text-[13px] font-semibold text-[var(--green-text)]">Saved.</p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button type="button" disabled={pending} onClick={save} className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold disabled:opacity-60">
          {pending ? "Saving…" : "Save plan"}
        </button>
        <button type="button" disabled={pending} onClick={lock} className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60">
          Lock plan
        </button>
      </div>
      <p className="mt-2.5 text-[11.5px] text-[var(--muted)]">
        Locking writes the milestones, ticks the last line on the stage 1 gate, and stops further
        edits without an admin unlock.
      </p>
    </div>
  );
}

export function RecordPaymentForm({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: Array<{ id: number; label: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full cursor-pointer rounded-lg bg-[var(--orange)] text-sm font-bold text-[var(--orange-ink)]">
        Record a payment
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const data = new FormData(e.currentTarget);
        const milestoneRaw = String(data.get("milestoneId") ?? "");
        const result = await recordPayment(projectId, {
          amount: String(data.get("amount") ?? ""),
          mode: data.get("mode") as "CASH" | "UPI" | "CHEQUE" | "NEFT" | "LOAN_DISBURSAL",
          receivedOn: String(data.get("receivedOn") ?? ""),
          referenceNo: String(data.get("referenceNo") ?? ""),
          ...(milestoneRaw ? { milestoneId: Number(milestoneRaw) } : {}),
        });
        setPending(false);
        if (!result.ok) return setError(result.error);
        setOpen(false);
        router.refresh();
      }}
      className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
    >
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls} htmlFor="amount">Amount</label>
          <input id="amount" name="amount" required className={`${field} ref`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="receivedOn">Received on</label>
          <input id="receivedOn" name="receivedOn" type="date" required className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mode">Mode</label>
          <select id="mode" name="mode" className={field}>
            <option value="NEFT">NEFT</option>
            <option value="UPI">UPI</option>
            <option value="CASH">Cash</option>
            <option value="CHEQUE">Cheque</option>
            <option value="LOAN_DISBURSAL">Loan disbursal</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="referenceNo">Reference</label>
          <input id="referenceNo" name="referenceNo" className={`${field} ref`} />
        </div>
        {milestones.length ? (
          <div className="col-span-2">
            <label className={labelCls} htmlFor="milestoneId">Against milestone</label>
            <select id="milestoneId" name="milestoneId" className={field}>
              <option value="">Not assigned</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="mb-2.5 text-[12.5px] font-medium text-[var(--red-text)]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60">
          {pending ? "Saving…" : "Record"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function FinanceForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { bankName: string; loanAmount: string; status: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setSaved(false);
        const data = new FormData(e.currentTarget);
        await saveFinance(projectId, {
          bankName: String(data.get("bankName") ?? ""),
          loanAmount: String(data.get("loanAmount") ?? ""),
          status: String(data.get("status") ?? "NOT_APPLIED"),
        });
        setPending(false);
        setSaved(true);
        router.refresh();
      }}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="bankName">Lender allotted</label>
          <input id="bankName" name="bankName" defaultValue={initial.bankName} className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="loanAmount">Loan amount</label>
          <input id="loanAmount" name="loanAmount" defaultValue={initial.loanAmount} className={`${field} ref`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={initial.status} className={field}>
            <option value="NOT_APPLIED">Not applied</option>
            <option value="APPLIED">Applied on Jan Samarth</option>
            <option value="SANCTIONED">Sanctioned, awaiting disbursal</option>
            <option value="DISBURSED">Disbursed</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>
      <button type="submit" disabled={pending} className="mt-3.5 h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : saved ? "Saved" : "Save finance"}
      </button>
    </form>
  );
}
