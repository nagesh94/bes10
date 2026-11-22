"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  recordCustomerAdvance,
  recordPayment,
  savePaymentPlan,
  saveFinance,
  type MilestoneInput,
} from "@/app/actions/payments";
import {
  PAID_OUT_MODES,
  RECEIVED_MODES,
  RECEIVED_MODE_LABELS,
  SCHEDULE_TRIGGERS,
  TRIGGER_LABELS,
  type PaidOutMode,
  type ReceivedMode,
} from "@/lib/payments/schedule";
import {
  LENDER_KINDS,
  LENDER_KIND_LABEL,
  viaJanSamarth,
  type LenderOption,
} from "@/lib/finance/lender-kinds";

type Mode = "CASH" | "FINANCE" | "SPLIT";

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Today in the browser's own zone, as a date input wants it. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function PaymentPlanForm({
  projectId,
  initial,
  lenders,
}: {
  projectId: string;
  /** Active lenders from master data, for a financed or split plan. */
  lenders: LenderOption[];
  initial: {
    /** The lender already on file, if any. */
    lenderId: number | null;
    lenderName: string;
    mode: Mode;
    totalValue: string;
    quotationAmount: string;
    /** Where the quotation amount came from when it was not typed: "BHIM100231". */
    quotationSource?: string | null;
    cashComponent: string;
    financeComponent: string;
    milestones: MilestoneInput[];
  };
}) {
  const t = useTranslations("payments.plan");
  const te = useTranslations("enums");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [total, setTotal] = useState(initial.totalValue);
  const [quoted, setQuoted] = useState(initial.quotationAmount);
  const [cash, setCash] = useState(initial.cashComponent);
  const [finance, setFinance] = useState(initial.financeComponent);
  const [milestones, setMilestones] = useState<MilestoneInput[]>(initial.milestones);
  const startLender = initialLenderChoice(lenders, { lenderId: initial.lenderId, bankName: initial.lenderName });
  const [lenderChoice, setLenderChoice] = useState(startLender.choice);
  const [lenderTyped, setLenderTyped] = useState(startLender.typed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const involvesFinance = mode === "FINANCE" || mode === "SPLIT";
  const num = (v: string) => Number(String(v).replace(/[,\s₹]/g, "")) || 0;
  const scheduledSum = milestones.reduce((s, m) => s + num(m.amount), 0);
  const componentSum = num(cash) + num(finance);
  const totalNum = num(total);
  const quotedNum = num(quoted);
  const discount = quotedNum > 0 && totalNum > 0 ? quotedNum - totalNum : 0;

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
      quotationAmount: quoted,
      cashComponent: cash,
      financeComponent: involvesFinance ? finance : "0",
      milestones,
      ...(involvesFinance ? { lender: toLenderChoice(lenders, lenderChoice, lenderTyped) } : {}),
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3">
        {(
          [
            ["CASH", t("modes.CASH.label"), t("modes.CASH.blurb")],
            ["FINANCE", t("modes.FINANCE.label"), t("modes.FINANCE.blurb")],
            ["SPLIT", t("modes.SPLIT.label"), t("modes.SPLIT.blurb")],
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
          <label className={labelCls} htmlFor="quoted">{t("quotationAmount")}</label>
          <input id="quoted" value={quoted} onChange={(e) => setQuoted(e.target.value)} className={`${field} ref`} placeholder="3,40,000" />
          {initial.quotationSource && quoted === initial.quotationAmount ? (
            <span className="mt-1 block text-[11.5px] text-[var(--muted)]">
              From quotation {initial.quotationSource}
            </span>
          ) : null}
        </div>
        <div>
          <label className={labelCls} htmlFor="total">{t("agreedValue")}</label>
          <input id="total" value={total} onChange={(e) => setTotal(e.target.value)} className={`${field} ref`} placeholder="3,10,000" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cash">{t("cashComponent")}</label>
          <input id="cash" value={cash} onChange={(e) => setCash(e.target.value)} className={`${field} ref`} />
        </div>
        {involvesFinance ? (
          <div>
            <label className={labelCls} htmlFor="fin">{t("financeComponent")}</label>
            <input id="fin" value={finance} onChange={(e) => setFinance(e.target.value)} className={`${field} ref`} />
          </div>
        ) : null}
      </div>

      {involvesFinance ? (
        <LenderPicker
          lenders={lenders}
          choice={lenderChoice}
          typed={lenderTyped}
          onChoice={setLenderChoice}
          onTyped={setLenderTyped}
        />
      ) : null}

      {discount !== 0 ? (
        <p
          className={`mb-4 rounded-lg border px-3.5 py-2.5 text-[12.5px] font-medium ${
            discount > 0
              ? "border-[var(--navy-border)] bg-[var(--navy-soft)] text-[var(--navy-text)]"
              : "border-[var(--amber-border)] bg-[var(--amber-surface)] text-[var(--amber-text)]"
          }`}
        >
          {discount > 0
            ? t("belowQuote", { amount: inr(discount), pct: Math.round((discount / quotedNum) * 100) })
            : t("aboveQuote", { amount: inr(-discount) })}
        </p>
      ) : null}

      {totalNum > 0 && Math.abs(componentSum - totalNum) > 1 ? (
        <p className="mb-4 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--amber-text)]">
          {t("componentsMismatch", { sum: inr(componentSum), total: inr(totalNum) })}
        </p>
      ) : null}

      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="flex-1 text-sm font-bold">{t("schedule")}</h3>
        <span className={`ref text-[12.5px] ${scheduledSum - totalNum > 1 ? "text-[var(--amber-text)]" : "text-[var(--muted)]"}`}>
          {t("xOfY", { x: inr(scheduledSum), y: inr(totalNum) })}
        </span>
      </div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">{t("scheduleHint")}</p>

      <div className="mb-3 space-y-2.5">
        {milestones.map((m, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <div className="min-w-40 flex-[2_1_180px]">
              <label className={labelCls} htmlFor={`mt-${i}`}>{t("trigger")}</label>
              <select id={`mt-${i}`} value={m.trigger} onChange={(e) => setMilestone(i, { trigger: e.target.value as MilestoneInput["trigger"] })} className={field}>
                {SCHEDULE_TRIGGERS.map((t) => (
                  <option key={t} value={t}>{te.has(`trigger.${t}`) ? te(`trigger.${t}`) : TRIGGER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="min-w-32 flex-[1_1_140px]">
              <label className={labelCls} htmlFor={`ma-${i}`}>{t("amount")}</label>
              <input id={`ma-${i}`} value={m.amount} onChange={(e) => setMilestone(i, { amount: e.target.value })} className={`${field} ref`} />
            </div>
            <button
              type="button"
              onClick={() => setMilestones((l) => l.filter((_, j) => j !== i))}
              aria-label={t("removeLine")}
              className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--red-text)]"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setMilestones((l) => [...l, { amount: "", trigger: "PSS1" }])}
        className="mb-5 h-11 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-bold text-[var(--navy-text)]"
      >
        + Add a line
      </button>

      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : saved ? (
        <p className="mb-4 text-[13px] font-semibold text-[var(--green-text)]">{t("saved")}</p>
      ) : null}

      <button type="button" disabled={pending} onClick={save} className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60">
        {pending ? t("saving") : t("savePlan")}
      </button>
    </div>
  );
}

export function RecordPaymentForm({
  projectId,
  milestones,
  defaultOpen = false,
  onDone,
}: {
  projectId: string;
  milestones: Array<{ id: number; label: string }>;
  /** Start on the form rather than the button — for use inside a dialog. */
  defaultOpen?: boolean;
  /** Called after a save or a cancel, so a dialog around this can close. */
  onDone?: () => void;
}) {
  const t = useTranslations("payments.plan");
  const te = useTranslations("enums");
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const close = () => {
    setOpen(defaultOpen);
    onDone?.();
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full cursor-pointer rounded-lg bg-[var(--orange)] text-sm font-bold text-[var(--orange-ink)]">
        {t("recordPayment")}
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
          mode: data.get("mode") as ReceivedMode,
          receivedOn: String(data.get("receivedOn") ?? ""),
          referenceNo: String(data.get("referenceNo") ?? ""),
          ...(milestoneRaw ? { milestoneId: Number(milestoneRaw) } : {}),
        });
        setPending(false);
        if (!result.ok) return setError(result.error);
        close();
        router.refresh();
      }}
      className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3.5"
    >
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls} htmlFor="amount">{t("amount")}</label>
          <input id="amount" name="amount" required className={`${field} ref`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="receivedOn">{t("receivedOn")}</label>
          <input id="receivedOn" name="receivedOn" type="date" required defaultValue={today()} className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mode">{t("mode")}</label>
          <select id="mode" name="mode" className={field}>
            {RECEIVED_MODES.map((m) => (
              <option key={m} value={m}>{te.has(`receivedMode.${m}`) ? te(`receivedMode.${m}`) : RECEIVED_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="referenceNo">{t("reference")}</label>
          <input id="referenceNo" name="referenceNo" className={`${field} ref`} />
        </div>
        {milestones.length ? (
          <div className="col-span-2">
            <label className={labelCls} htmlFor="milestoneId">{t("againstLine")}</label>
            <select id="milestoneId" name="milestoneId" className={field}>
              <option value="">{t("notAssigned")}</option>
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
          {pending ? t("saving") : t("record")}
        </button>
        <button type="button" onClick={close} className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/**
 * Money going the other way.
 *
 * Kept visibly apart from recording a payment — same shape, opposite sign,
 * and the one thing that must never be confused with it.
 */
export function GiveMoneyForm({ projectId }: { projectId: string }) {
  const t = useTranslations("payments.plan");
  const te = useTranslations("enums");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] text-sm font-bold text-[var(--navy-text)]">
        {t("giveMoney")}
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
        const result = await recordCustomerAdvance(projectId, {
          amount: String(data.get("amount") ?? ""),
          mode: data.get("mode") as PaidOutMode,
          paidOn: String(data.get("paidOn") ?? ""),
          referenceNo: String(data.get("referenceNo") ?? ""),
          note: String(data.get("note") ?? ""),
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
          <label className={labelCls} htmlFor="advAmount">{t("amountGiven")}</label>
          <input id="advAmount" name="amount" required className={`${field} ref`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="paidOn">{t("givenOn")}</label>
          <input id="paidOn" name="paidOn" type="date" required className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="advMode">{t("mode")}</label>
          <select id="advMode" name="mode" className={field}>
            {PAID_OUT_MODES.map((m) => (
              <option key={m} value={m}>{te.has(`receivedMode.${m}`) ? te(`receivedMode.${m}`) : RECEIVED_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="advRef">{t("reference")}</label>
          <input id="advRef" name="referenceNo" className={`${field} ref`} />
        </div>
        <div className="col-span-2">
          <label className={labelCls} htmlFor="advNote">{t("whatFor")}</label>
          <input id="advNote" name="note" placeholder={t("whatForPlaceholder")} className={field} />
        </div>
      </div>
      {error ? <p role="alert" className="mb-2.5 text-[12.5px] font-medium text-[var(--red-text)]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60">
          {pending ? t("saving") : t("record")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

const OTHER = "other";

/** What the plan form sends for the lender: a picked id, or a typed name. */
export interface LenderChoice {
  lenderId: number | null;
  lenderName: string;
}

/**
 * Who is lending, picked from master data and grouped by type — a bank goes
 * through Jan Samarth, a third-party finance company like Bajaj Finserv is
 * applied to directly, so the type is shown the moment one is picked. A
 * lender not yet in the list can still be typed; an admin adds it later.
 */
function LenderPicker({
  lenders,
  choice,
  typed,
  onChoice,
  onTyped,
}: {
  lenders: LenderOption[];
  choice: string;
  typed: string;
  onChoice: (value: string) => void;
  onTyped: (value: string) => void;
}) {
  const t = useTranslations("payments.plan");
  const te = useTranslations("enums");
  const picked = lenders.find((l) => String(l.id) === choice);
  return (
    <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      <div>
        <label className={labelCls} htmlFor="lenderId">{t("lender")}</label>
        <select id="lenderId" value={choice} onChange={(e) => onChoice(e.target.value)} className={field}>
          <option value="">{t("notDecided")}</option>
          {LENDER_KINDS.map((kind) => {
            const of = lenders.filter((l) => l.kind === kind);
            if (!of.length) return null;
            return (
              <optgroup key={kind} label={te(`lenderKind.${kind}`)}>
                {of.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
            );
          })}
          <option value={OTHER}>{t("otherType")}</option>
        </select>
        {picked ? (
          <span className="mt-1 block text-[11.5px] text-[var(--muted)]">
            {te(`lenderKind.${picked.kind}`)} ·{" "}
            {viaJanSamarth(picked.kind) ? t("viaJanSamarth") : t("direct")}
          </span>
        ) : null}
      </div>
      {choice === OTHER ? (
        <div>
          <label className={labelCls} htmlFor="lenderName">{t("lenderName")}</label>
          <input
            id="lenderName"
            value={typed}
            onChange={(e) => onTyped(e.target.value)}
            placeholder={t("lenderNamePlaceholder")}
            className={field}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The dropdown's starting value for a saved lender. */
export function initialLenderChoice(
  lenders: LenderOption[],
  saved: { lenderId: number | null; bankName: string },
): { choice: string; typed: string } {
  // A saved lender that has since been retired falls back to its name.
  if (saved.lenderId && lenders.some((l) => l.id === saved.lenderId)) {
    return { choice: String(saved.lenderId), typed: "" };
  }
  return saved.bankName ? { choice: OTHER, typed: saved.bankName } : { choice: "", typed: "" };
}

function toLenderChoice(lenders: LenderOption[], choice: string, typed: string): LenderChoice {
  const picked = lenders.find((l) => String(l.id) === choice);
  if (picked) return { lenderId: picked.id, lenderName: picked.name };
  return { lenderId: null, lenderName: choice === OTHER ? typed.trim() : "" };
}

/**
 * Where the loan has got to: the amount and the status. The lender itself is
 * chosen in the payment plan, so it is shown here rather than asked again.
 */
export function FinanceForm({
  projectId,
  initial,
  lenderLabel,
  onDone,
}: {
  projectId: string;
  initial: { loanAmount: string; status: string };
  /** "Bajaj Finserv · Third-party finance (NBFC)", or null when none is set. */
  lenderLabel: string | null;
  /** Called after a save, so a dialog around this can close. */
  onDone?: () => void;
}) {
  const t = useTranslations("payments.plan");
  const te = useTranslations("enums");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setSaved(false);
        setError(null);
        const data = new FormData(e.currentTarget);
        const result = await saveFinance(projectId, {
          loanAmount: String(data.get("loanAmount") ?? ""),
          status: String(data.get("status") ?? "NOT_APPLIED"),
        });
        setPending(false);
        if (!result.ok) return setError(result.error);
        setSaved(true);
        router.refresh();
        onDone?.();
      }}
    >
      <div className="mb-3.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[13px]">
        <span className="text-[var(--muted)]">{t("lenderColon")}</span>
        <span className="font-semibold">{lenderLabel ?? t("notChosen")}</span>
        <span className="block text-[11.5px] text-[var(--muted)]">{t("chosenInPlan")}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="loanAmount">{t("loanAmount")}</label>
          <input id="loanAmount" name="loanAmount" defaultValue={initial.loanAmount} className={`${field} ref`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="status">{t("status")}</label>
          <select id="status" name="status" defaultValue={initial.status} className={field}>
            <option value="NOT_APPLIED">{te("financeStatus.NOT_APPLIED")}</option>
            <option value="APPLIED">{te("financeStatus.APPLIED")}</option>
            <option value="SANCTIONED">{te("financeStatus.SANCTIONED")}</option>
            <option value="DISBURSED">{te("financeStatus.DISBURSED")}</option>
            <option value="REJECTED">{te("financeStatus.REJECTED")}</option>
          </select>
        </div>
      </div>
      {error ? <p role="alert" className="mt-2.5 text-[12.5px] font-medium text-[var(--red-text)]">{error}</p> : null}
      <button type="submit" disabled={pending} className="mt-3.5 h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold disabled:opacity-60">
        {pending ? t("saving") : saved ? t("savedShort") : t("saveFinance")}
      </button>
    </form>
  );
}
