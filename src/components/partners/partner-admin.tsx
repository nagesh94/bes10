"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  accrueCommission,
  savePartner,
  setCommissionStatus,
  setPartnerActive,
  type PartnerInput,
} from "@/app/actions/partners";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const primary =
  "h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60";
const small =
  "h-9 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--navy)] disabled:opacity-60";

const EMPTY: PartnerInput = {
  name: "",
  phone: "",
  email: "",
  address: "",
  panNumber: "",
  bankAccountNumber: "",
  ifscCode: "",
  upiId: "",
  commissionBasis: "PER_KW",
  commissionRate: "",
  notes: "",
};

export function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Add or edit a partner.
 *
 * The rate is captured here but never applied retroactively — a commission
 * row copies the rate at accrual, so changing it affects future referrals
 * only.
 */
export function PartnerForm({
  initial,
  partnerId,
  onDone,
}: {
  initial?: PartnerInput;
  partnerId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<PartnerInput>(initial ?? EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text: Array<[keyof PartnerInput, string, string]> = [
    ["name", "Name", "Ramesh Yadav"],
    ["phone", "Phone", "98269 83922"],
    ["email", "Email", "optional"],
    ["address", "Address", "optional"],
    ["panNumber", "PAN", "optional"],
    ["bankAccountNumber", "Bank account", "optional"],
    ["ifscCode", "IFSC", "optional"],
    ["upiId", "UPI id", "optional"],
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {text.map(([key, label, placeholder]) => (
          <div key={key}>
            <label className={labelCls} htmlFor={`p-${key}`}>{label}</label>
            <input
              id={`p-${key}`}
              value={v[key] as string}
              onChange={(e) => setV((o) => ({ ...o, [key]: e.target.value }))}
              placeholder={placeholder}
              className={cell}
            />
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <div className={labelCls}>Paid</div>
          <div className="inline-flex rounded-lg bg-[var(--surface-sunken)] p-[3px]">
            {(["PER_KW", "FLAT_PER_PROJECT"] as const).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={v.commissionBasis === b}
                onClick={() => setV((o) => ({ ...o, commissionBasis: b }))}
                className={`h-9 cursor-pointer rounded-md px-4 text-[13px] ${
                  v.commissionBasis === b
                    ? "bg-[var(--orange)] font-bold text-[var(--orange-ink)]"
                    : "font-semibold text-[var(--muted)]"
                }`}
              >
                {b === "PER_KW" ? "Per kW" : "Flat per project"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-40">
          <label className={labelCls} htmlFor="p-rate">
            Rate ({v.commissionBasis === "PER_KW" ? "₹ per kW" : "₹ per project"})
          </label>
          <input
            id="p-rate"
            value={v.commissionRate}
            onChange={(e) => setV((o) => ({ ...o, commissionRate: e.target.value }))}
            inputMode="decimal"
            placeholder="2000"
            className={`${cell} ref`}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className={labelCls} htmlFor="p-notes">Notes</label>
        <input
          id="p-notes"
          value={v.notes}
          onChange={(e) => setV((o) => ({ ...o, notes: e.target.value }))}
          placeholder="How they came to us, anything to remember"
          className={cell}
        />
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await savePartner(partnerId ?? null, v);
            setPending(false);
            if (!result.ok) return setError(result.error);
            if (!partnerId) setV(EMPTY);
            onDone?.();
            router.refresh();
          }}
          className={primary}
        >
          {pending ? "Saving…" : partnerId ? "Save changes" : "Add partner"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className={small}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface PartnerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  panNumber: string | null;
  bankAccountNumber: string | null;
  ifscCode: string | null;
  upiId: string | null;
  commissionBasis: "PER_KW" | "FLAT_PER_PROJECT";
  commissionRate: string | null;
  notes: string | null;
  active: boolean;
  referrals: number;
  accrued: number;
  due: number;
  paid: number;
}

export function PartnerCard({ partner }: { partner: PartnerRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const rate = Number(partner.commissionRate ?? 0);
  const rateLabel = rate
    ? `${rupees(rate)} ${partner.commissionBasis === "PER_KW" ? "per kW" : "per project"}`
    : "No rate set";

  return (
    <div
      className={`rounded-[var(--radius)] border bg-[var(--surface)] px-5 py-4 ${
        partner.active ? "border-[var(--line)]" : "border-dashed border-[var(--line)] opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-44 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold">{partner.name}</h3>
            {!partner.active ? (
              <span className="rounded-full bg-[var(--chip-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--muted)] uppercase">
                Inactive
              </span>
            ) : null}
          </div>
          <p className="ref mt-0.5 text-[12.5px] text-[var(--muted)]">
            {partner.phone}
            {partner.email ? ` · ${partner.email}` : ""}
          </p>
          <p className="mt-1 text-[12.5px] font-semibold text-[var(--navy)]">{rateLabel}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-4 text-right">
          {[
            ["Referrals", String(partner.referrals), "var(--muted)"],
            ["Accrued", rupees(partner.accrued), "var(--amber-text)"],
            ["Due", rupees(partner.due), "var(--red-text)"],
            ["Paid", rupees(partner.paid), "var(--green-text)"],
          ].map(([label, val, colour]) => (
            <div key={label}>
              <div className="text-[11.5px] font-semibold text-[var(--muted-soft)]">
                {label}
              </div>
              <div className="ref text-[14px] font-bold" style={{ color: colour }}>
                {val}
              </div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setEditing((e) => !e)} className={small}>
            {editing ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await setPartnerActive(partner.id, !partner.active);
              setBusy(false);
              router.refresh();
            }}
            className={small}
          >
            {partner.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
          <PartnerForm
            partnerId={partner.id}
            initial={{
              name: partner.name,
              phone: partner.phone,
              email: partner.email ?? "",
              address: partner.address ?? "",
              panNumber: partner.panNumber ?? "",
              bankAccountNumber: partner.bankAccountNumber ?? "",
              ifscCode: partner.ifscCode ?? "",
              upiId: partner.upiId ?? "",
              commissionBasis: partner.commissionBasis,
              commissionRate: partner.commissionRate ?? "",
              notes: partner.notes ?? "",
            }}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export interface CommissionRow {
  id: number;
  partnerName: string;
  projectId: string;
  projectCode: string;
  consumer: string;
  status: "ACCRUED" | "DUE" | "PAID" | "CANCELLED";
  amount: number;
  basis: "PER_KW" | "FLAT_PER_PROJECT";
  rate: number;
  plantKw: string | null;
  paidReference: string | null;
  cancelledReason: string | null;
}

const STATUS_TONE: Record<string, string> = {
  ACCRUED: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
  DUE: "bg-[var(--red-soft)] text-[var(--red-text)]",
  PAID: "bg-[var(--green-soft)] text-[var(--green-text)]",
  CANCELLED: "bg-[var(--chip-soft)] text-[var(--muted)]",
};

/** Move a commission along: accrued → due → paid, or cancel it with a reason. */
export function CommissionList({ rows }: { rows: CommissionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function move(
    id: number,
    status: "DUE" | "PAID" | "CANCELLED",
    detail: { reference?: string; reason?: string } = {},
  ) {
    setBusy(id);
    setError(null);
    const result = await setCommissionStatus(id, status, detail);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setCancelling(null);
    setReason("");
    setReference("");
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-[9px] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
        Nothing accrued yet. A commission appears here once a referred project is commissioned.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-[9px] border border-[var(--line)]">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
              i < rows.length - 1 ? "border-b border-[var(--line-soft)]" : ""
            }`}
          >
            <span className="min-w-40 flex-1">
              <span className="block text-[13.5px] font-semibold">{r.partnerName}</span>
              <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
                {r.projectCode} · {r.consumer}
              </span>
            </span>

            <span className="min-w-28 text-[11.5px] text-[var(--muted)]">
              {r.basis === "PER_KW"
                ? `${rupees(r.rate)}/kW × ${r.plantKw ?? "?"} kW`
                : "Flat fee"}
            </span>

            <span className="ref min-w-20 text-right text-[14px] font-bold">
              {rupees(r.amount)}
            </span>

            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                STATUS_TONE[r.status]
              }`}
            >
              {r.status}
            </span>

            <span className="flex shrink-0 gap-2">
              {r.status === "ACCRUED" ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void move(r.id, "DUE")}
                  className={small}
                >
                  Mark due
                </button>
              ) : null}
              {(r.status === "ACCRUED" || r.status === "DUE") ? (
                <>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void move(r.id, "PAID", { reference })}
                    className={small}
                  >
                    {busy === r.id ? "…" : "Mark paid"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setCancelling(cancelling === r.id ? null : r.id)}
                    className={small}
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </span>

            {r.status === "PAID" && r.paidReference ? (
              <span className="ref w-full text-[11px] text-[var(--muted-soft)]">
                Reference: {r.paidReference}
              </span>
            ) : null}
            {r.status === "CANCELLED" && r.cancelledReason ? (
              <span className="w-full text-[11px] text-[var(--muted-soft)]">
                Cancelled: {r.cancelledReason}
              </span>
            ) : null}

            {cancelling === r.id ? (
              <div className="flex w-full flex-wrap gap-2 pt-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being cancelled?"
                  className={`${cell} min-w-52 flex-1`}
                />
                <button
                  type="button"
                  disabled={busy !== null || reason.trim().length === 0}
                  onClick={() => void move(r.id, "CANCELLED", { reason })}
                  className={primary}
                >
                  Confirm cancel
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={labelCls} htmlFor="payref">Payment reference for the next "Mark paid"</label>
        <input
          id="payref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UTR or cheque number"
          className={`${cell} ref max-w-64`}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}
    </div>
  );
}

/** Accrues a commission for a commissioned project that has a referrer. */
export function AccrueButton({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await accrueCommission(projectId);
          setBusy(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
        className={small}
      >
        {busy ? "…" : label}
      </button>
      {error ? (
        <span role="alert" className="ml-2 text-[11.5px] text-[var(--red-text)]">{error}</span>
      ) : null}
    </span>
  );
}
