"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordPayment, saveSubsidy } from "@/app/actions/payments";
import {
  RECEIVED_MODES,
  RECEIVED_MODE_LABELS,
  type ReceivedMode,
} from "@/lib/payments/schedule";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const primary =
  "h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60";

const STATUSES = [
  { value: "NOT_APPLIED", label: "Not applied" },
  { value: "APPLIED", label: "Applied" },
  { value: "APPROVED", label: "Approved" },
  { value: "RECEIVED", label: "Received" },
] as const;

/**
 * The subsidy, tracked to the day it lands.
 *
 * Applied for on the national portal, not here, so this is a record of what
 * happened there — the same honest-ledger pattern as the portal upload
 * checklist.
 */
export function SubsidyForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    status: string;
    expectedAmount: string;
    receivedAmount: string;
    receivedOn: string;
  };
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = Number(v.expectedAmount) || 0;
  const received = Number(v.receivedAmount) || 0;
  const shortfall = v.status === "RECEIVED" && expected > 0 ? expected - received : 0;

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">Subsidy</h2>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
        Claimed on the PM Surya Ghar portal and paid straight to the consumer&apos;s bank account.
        This records what actually happened there.
      </p>

      <div className="mb-4">
        <div className={labelCls}>Status</div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={v.status === s.value}
              onClick={() => {
                setV((o) => ({ ...o, status: s.value }));
                setSaved(false);
              }}
              className={`h-10 cursor-pointer rounded-lg px-4 text-[13px] ${
                v.status === s.value
                  ? "bg-[var(--orange)] font-bold text-[var(--orange-ink)]"
                  : "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--muted)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="s-expected">Expected (₹)</label>
          <input
            id="s-expected"
            value={v.expectedAmount}
            onChange={(e) => {
              setV((o) => ({ ...o, expectedAmount: e.target.value }));
              setSaved(false);
            }}
            inputMode="decimal"
            placeholder="78000"
            className={`${cell} ref`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="s-received">Received (₹)</label>
          <input
            id="s-received"
            value={v.receivedAmount}
            onChange={(e) => {
              setV((o) => ({ ...o, receivedAmount: e.target.value }));
              setSaved(false);
            }}
            inputMode="decimal"
            className={`${cell} ref`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="s-on">Received on</label>
          <input
            id="s-on"
            type="date"
            value={v.receivedOn}
            onChange={(e) => {
              setV((o) => ({ ...o, receivedOn: e.target.value }));
              setSaved(false);
            }}
            className={cell}
          />
        </div>
      </div>

      {shortfall > 0 ? (
        <p className="mb-3 rounded-lg bg-[var(--amber-surface)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--amber-text)]">
          ₹{shortfall.toLocaleString("en-IN")} less than expected arrived. Worth checking before
          this project is closed.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await saveSubsidy(projectId, v);
          setPending(false);
          if (!result.ok) return setError(result.error);
          setSaved(true);
          router.refresh();
        }}
        className={primary}
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save subsidy"}
      </button>
    </div>
  );
}

/** Records a payment against the outstanding balance. */
export function FinalPayment({
  projectId,
  outstanding,
}: {
  projectId: string;
  outstanding: number;
}) {
  const router = useRouter();
  const [v, setV] = useState({
    amount: "",
    mode: "NEFT" as ReceivedMode,
    referenceNo: "",
    receivedOn: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">Final payment</h2>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
        {outstanding > 0
          ? `₹${outstanding.toLocaleString("en-IN")} still to come in before this project can close.`
          : "Nothing outstanding. Anything recorded here would be an overpayment."}
      </p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="f-amount">Amount (₹)</label>
          <input
            id="f-amount"
            value={v.amount}
            onChange={(e) => setV((o) => ({ ...o, amount: e.target.value }))}
            inputMode="decimal"
            placeholder={outstanding > 0 ? String(outstanding) : ""}
            className={`${cell} ref`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-method">Mode</label>
          <select
            id="f-method"
            value={v.mode}
            onChange={(e) =>
              setV((o) => ({ ...o, mode: e.target.value as typeof o.mode }))
            }
            className={cell}
          >
            {RECEIVED_MODES.map((m) => (
              <option key={m} value={m}>{RECEIVED_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="f-ref">Reference</label>
          <input
            id="f-ref"
            value={v.referenceNo}
            onChange={(e) => setV((o) => ({ ...o, referenceNo: e.target.value }))}
            placeholder="UTR or cheque no."
            className={`${cell} ref`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-on">Paid on</label>
          <input
            id="f-on"
            type="date"
            value={v.receivedOn}
            onChange={(e) => setV((o) => ({ ...o, receivedOn: e.target.value }))}
            className={cell}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={pending || !v.amount.trim()}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await recordPayment(projectId, v);
          setPending(false);
          if (!result.ok) return setError(result.error);
          setV({ amount: "", mode: "NEFT", referenceNo: "", receivedOn: "" });
          router.refresh();
        }}
        className={primary}
      >
        {pending ? "Recording…" : "Record payment"}
      </button>
    </div>
  );
}
