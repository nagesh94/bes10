"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { resetCostSheet, saveCostSheet } from "@/app/actions/costs";
import { useConfirm } from "@/components/shell/confirm";
import type { CostLine } from "@/lib/finance/cost-sheet";
import { COST_PAYMENT_LABEL, COST_PAYMENT_MODES } from "@/lib/finance/cost-payment";

/**
 * The editable half of the cost calculator: dealer-bought material.
 *
 * Quantities and rates are typed as text and parsed for the totals, so a
 * half-typed "1,2" never jumps the cursor. Amount is always quantity × rate
 * — the server works it out the same way on save.
 */

interface Row {
  key: number;
  code: string;
  label: string;
  quantity: string;
  unit: string;
  rate: string;
  source?: string | null;
  paymentMode: string;
  paymentNote: string;
}

const num = (v: string) => {
  const n = Number(String(v).replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const cell =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";

let nextKey = 1;
const toRows = (lines: CostLine[]): Row[] =>
  lines.map((l) => ({
    key: nextKey++,
    code: l.code,
    label: l.label,
    quantity: String(l.quantity),
    unit: l.unit,
    rate: String(l.rate),
    source: l.source,
    paymentMode: l.paymentMode ?? "",
    paymentNote: l.paymentNote ?? "",
  }));

export function CostSheetEditor({
  projectId,
  lines,
  proposed,
  saved,
  agreedValue,
  expensesTotal,
  systemKw,
  canWrite,
}: {
  projectId: string;
  lines: CostLine[];
  proposed: CostLine[];
  saved: boolean;
  agreedValue: number;
  expensesTotal: number;
  systemKw: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [rows, setRows] = useState<Row[]>(() => toRows(lines));
  const [dirty, setDirty] = useState(!saved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const proposedBy = useMemo(() => new Map(proposed.map((l) => [l.code, l])), [proposed]);
  const materialTotal = rows.reduce((s, r) => s + num(r.quantity) * num(r.rate), 0);
  const totalCost = materialTotal + expensesTotal;
  const margin = agreedValue - totalCost;

  function patch(key: number, change: Partial<Row>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveCostSheet(
      projectId,
      rows.map((r) => ({
        code: r.code,
        label: r.label,
        quantity: r.quantity,
        unit: r.unit,
        rate: r.rate,
        paymentMode: r.paymentMode || null,
        paymentNote: r.paymentNote,
      })),
    );
    setPending(false);
    if (!result.ok) return setError(result.error);
    setDirty(false);
    setNotice("Saved.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-start gap-4.5">
      <section className="min-w-0 flex-[999_1_620px] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Material from dealers</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
              {saved
                ? "Saved sheet. Quantities shown under each line are what installation records now."
                : "Proposed from installation and the rate card — check, edit and save."}
            </p>
          </div>
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                setRows(toRows(proposed));
                setDirty(true);
                setNotice("Refilled from installation and the rate card. Save to keep it.");
              }}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--navy-text)] hover:bg-[var(--surface-2)]"
            >
              <RotateCcw size={13} aria-hidden />
              Refill from installation
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                <th className="px-5 py-2.5">Item</th>
                <th className="w-28 px-2 py-2.5">Quantity</th>
                <th className="w-20 px-2 py-2.5">Unit</th>
                <th className="w-32 px-2 py-2.5">Rate (₹)</th>
                <th className="w-36 px-2 py-2.5">Paid by</th>
                <th className="w-32 px-3 py-2.5 text-right">Amount</th>
                {canWrite ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = proposedBy.get(r.code);
                const differs = saved && p && Math.abs(p.quantity - num(r.quantity)) > 0.01;
                return (
                  <tr key={r.key} className="border-b border-[var(--line-soft)] align-top last:border-b-0">
                    <td className="px-5 py-2.5">
                      <input
                        value={r.label}
                        onChange={(e) => patch(r.key, { label: e.target.value })}
                        disabled={!canWrite}
                        aria-label="Item"
                        className={`${cell} font-semibold`}
                      />
                      {r.source ? <div className="mt-1 text-[11.5px] text-[var(--muted)]">{r.source}</div> : null}
                      {differs && canWrite ? (
                        <button
                          type="button"
                          onClick={() => patch(r.key, { quantity: String(p.quantity) })}
                          className="mt-1 cursor-pointer text-[11.5px] font-semibold text-[var(--amber-text)] underline-offset-2 hover:underline"
                        >
                          Installation now says {p.quantity} {p.unit} — use it
                        </button>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        value={r.quantity}
                        inputMode="decimal"
                        onChange={(e) => patch(r.key, { quantity: e.target.value })}
                        disabled={!canWrite}
                        aria-label={`${r.label} quantity`}
                        className={`${cell} ref text-right`}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        value={r.unit}
                        onChange={(e) => patch(r.key, { unit: e.target.value })}
                        disabled={!canWrite || r.code !== "CUSTOM"}
                        aria-label={`${r.label} unit`}
                        className={`${cell} disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)]`}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        value={r.rate}
                        inputMode="decimal"
                        onChange={(e) => patch(r.key, { rate: e.target.value })}
                        disabled={!canWrite}
                        aria-label={`${r.label} rate`}
                        className={`${cell} ref text-right`}
                      />
                      {p && Math.abs(p.rate - num(r.rate)) > 0.001 ? (
                        <div className="mt-1 text-[11px] text-[var(--muted)]">card: {p.rate}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5">
                      <select
                        value={r.paymentMode}
                        onChange={(e) => patch(r.key, { paymentMode: e.target.value })}
                        disabled={!canWrite}
                        aria-label={`How ${r.label} was paid`}
                        className={`${cell} cursor-pointer ${r.paymentMode ? "" : "text-[var(--muted)]"}`}
                      >
                        <option value="">Not set</option>
                        {COST_PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>{COST_PAYMENT_LABEL[m]}</option>
                        ))}
                      </select>
                      {r.paymentMode === "OTHER" ? (
                        <input
                          value={r.paymentNote}
                          onChange={(e) => patch(r.key, { paymentNote: e.target.value })}
                          disabled={!canWrite}
                          placeholder="How? e.g. dealer credit"
                          aria-label={`How ${r.label} was paid, in words`}
                          className={`${cell} mt-1.5 h-9 text-[13px]`}
                        />
                      ) : null}
                    </td>
                    <td className="num px-3 py-4 text-right text-[14px] font-bold">
                      {inr(num(r.quantity) * num(r.rate))}
                    </td>
                    {canWrite ? (
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          aria-label={`Remove ${r.label}`}
                          onClick={() => {
                            setRows((list) => list.filter((x) => x.key !== r.key));
                            setDirty(true);
                          }}
                          className="grid h-10 w-8 cursor-pointer place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--red-soft)] hover:text-[var(--red-text)]"
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--line)] bg-[var(--surface-2)]">
                <td className="px-5 py-3 text-[13px] font-bold" colSpan={5}>
                  Material total
                </td>
                <td className="num px-3 py-3 text-right text-[15px] font-extrabold">{inr(materialTotal)}</td>
                {canWrite ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>

        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--line-soft)] px-5 py-4">
            <button
              type="button"
              onClick={() => {
                setRows((list) => [
                  ...list,
                  {
                    key: nextKey++,
                    code: "CUSTOM",
                    label: "",
                    quantity: "1",
                    unit: "piece",
                    rate: "",
                    paymentMode: "",
                    paymentNote: "",
                  },
                ]);
                setDirty(true);
              }}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--navy-text)]"
            >
              <Plus size={14} aria-hidden />
              Add a line
            </button>
            <span className="flex-1" />
            {error ? <span role="alert" className="text-[12.5px] font-medium text-[var(--red-text)]">{error}</span> : null}
            {notice && !error ? <span className="text-[12.5px] font-semibold text-[var(--green-text)]">{notice}</span> : null}
            {saved ? (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const answer = await ask({
                    title: "Discard the saved sheet?",
                    body: "The calculator goes back to proposing lines from installation and the rate card.",
                    confirmLabel: "Discard",
                  });
                  if (!answer.confirmed) return;
                  setPending(true);
                  await resetCostSheet(projectId);
                  setPending(false);
                  setRows(toRows(proposed));
                  setDirty(true);
                  router.refresh();
                }}
                className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Discard saved
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={save}
              className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-[13.5px] font-bold text-[var(--orange-ink)] disabled:opacity-50"
            >
              {pending ? "Saving…" : dirty ? "Save cost sheet" : "Saved"}
            </button>
          </div>
        ) : null}
      </section>

      <aside className="min-w-72 flex-[1_1_300px]">
        <section className="sticky top-4 rounded-[var(--radius)] bg-[var(--navy)] px-6 py-5 text-[var(--navy-ink)]">
          <h2 className="mb-4 text-[15px] font-bold opacity-80">Cost of this site</h2>
          {[
            ["Material from dealers", inr(materialTotal)],
            ["Site expenses", inr(expensesTotal)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between py-1.5">
              <span className="text-[13px] opacity-75">{k}</span>
              <span className="ref text-[15px] font-medium">{v}</span>
            </div>
          ))}
          <div className="mt-1.5 flex items-baseline justify-between border-t border-white/15 pt-3">
            <span className="text-sm font-semibold">Total cost</span>
            <span className="ref text-[20px] font-semibold">{inr(totalCost)}</span>
          </div>
          {systemKw ? (
            <div className="flex items-baseline justify-between py-1.5">
              <span className="text-[12.5px] opacity-70">per kW ({systemKw} kW)</span>
              <span className="ref text-[13px] opacity-85">{inr(totalCost / systemKw)}</span>
            </div>
          ) : null}
          <div className="mt-3 flex items-baseline justify-between border-t border-white/15 pt-3">
            <span className="text-[13px] opacity-75">Agreed value</span>
            <span className="ref text-[15px] font-medium">{agreedValue ? inr(agreedValue) : "not set"}</span>
          </div>
          {agreedValue ? (
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold">Margin</span>
              <span className={`ref text-[22px] font-semibold ${margin < 0 ? "text-[var(--red-soft)]" : "text-[var(--green)]"}`}>
                {margin < 0 ? "−" : ""}
                {inr(Math.abs(margin))}
                <span className="ml-1.5 text-[13px] opacity-80">{Math.round((margin / agreedValue) * 100)}%</span>
              </span>
            </div>
          ) : null}
          {dirty && canWrite ? (
            <p className="mt-3.5 rounded-lg bg-white/10 px-3 py-2 text-[12px]">Not saved yet — the dashboard uses the saved sheet.</p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
