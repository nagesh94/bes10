"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BatteryCharging,
  Check,
  Copy,
  PlugZap,
  Plus,
  RotateCcw,
  Save,
  Sun,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { deleteEstimate, saveEstimate } from "@/app/actions/estimates";
import { Combobox } from "@/components/finance/combobox";
import { BatteryCalculatorPanel } from "@/components/estimator/battery-calculator";
import { useConfirm } from "@/components/shell/confirm";
import {
  LINE_GROUPS,
  SYSTEM_TYPES,
  SYSTEM_TYPE_BLURB,
  SYSTEM_TYPE_LABEL,
  calculateEstimate,
  systemVoltage,
  type EstimateInputs,
  type EstimateLine,
  type SystemType,
} from "@/lib/estimator/engine";

/**
 * The pre-installation cost estimator.
 *
 * Everything recalculates as it is typed, using the same engine the server
 * runs on save. The left side is the system as imagined — type, size,
 * battery, the distances on site; the middle is every line that system
 * implies, each editable; the right is the price it adds up to and what the
 * customer actually pays after subsidy.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const card = "rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]";

const GROUP_COLOR: Record<string, string> = {
  Modules: "var(--data-1)",
  Inverter: "var(--data-2)",
  "Battery bank": "var(--data-3)",
  "Balance of system": "var(--data-4)",
  Structure: "var(--data-5)",
  "Site & services": "var(--data-6)",
};

const TYPE_ICON: Record<SystemType, typeof Sun> = { ON_GRID: PlugZap, HYBRID: BatteryCharging, OFF_GRID: Unplug };

/** A number box that keeps what is typed until it parses, so "1." survives. */
function NumberBox({
  value,
  onValue,
  className = field,
  ariaLabel,
  id,
  placeholder,
  step,
}: {
  value: number | null | undefined;
  onValue: (n: number | null) => void;
  className?: string;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
  step?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : String(value));
  }, [value]);
  return (
    <input
      id={id}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-step={step}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value == null ? "" : String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const raw = e.target.value.replace(/[,\s₹]/g, "");
        if (raw === "") return onValue(null);
        const n = Number(raw);
        if (Number.isFinite(n)) onValue(n);
      }}
      className={`${className} ref`}
    />
  );
}

/** A two- or three-way switch. `disabled` holds the reason it is locked. */
function Toggle<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled = null,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<readonly [V, string]>;
  onChange: (v: V) => void;
  disabled?: string | null;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className={`flex h-11 rounded-lg border border-[var(--line)] p-1 ${disabled ? "opacity-60" : ""}`}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            disabled={Boolean(disabled)}
            onClick={() => onChange(v)}
            className={`flex-1 rounded-md text-[13px] font-semibold ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${
              value === v ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "text-[var(--muted)]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {disabled ? <span className="mt-1 block text-[11px] text-[var(--muted)]">{disabled}</span> : null}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={`${card} px-5 py-4.5`}>
      <h2 className="text-[15px] font-bold">{title}</h2>
      {note ? <p className="mt-0.5 mb-3.5 text-[12.5px] text-[var(--muted)]">{note}</p> : <div className="mb-3.5" />}
      {children}
    </section>
  );
}

export interface EstimatorProps {
  id: string | null;
  number: string | null;
  initial: {
    name: string;
    phone: string;
    projectId: string;
    notes: string;
    inputs: EstimateInputs;
  };
  /** The rates this estimate was priced with — a snapshot for a saved one. */
  rates: Record<string, number>;
  /** Today's rate card, when it may differ from `rates`. */
  currentRates?: Record<string, number>;
  projects: Array<{ id: string; label: string; name: string; phone: string | null }>;
  canWrite: boolean;
}

export function Estimator({ id, number, initial, rates: savedRates, currentRates, projects, canWrite }: EstimatorProps) {
  const [rates, setRates] = useState(savedRates);
  const [repriced, setRepriced] = useState(false);
  const stale = useMemo(() => {
    if (!currentRates) return false;
    const keys = new Set([...Object.keys(rates), ...Object.keys(currentRates)]);
    return [...keys].some((k) => (rates[k] ?? 0) !== (currentRates[k] ?? 0));
  }, [rates, currentRates]);
  const router = useRouter();
  const ask = useConfirm();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [notes, setNotes] = useState(initial.notes);
  const [inputs, setInputs] = useState<EstimateInputs>(initial.inputs);
  const [dirty, setDirty] = useState(!id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => calculateEstimate(inputs, rates), [inputs, rates]);
  // The same system priced three ways, edits aside, so the customer's choice
  // of type is made with the numbers in front of them.
  const comparison = useMemo(
    () =>
      SYSTEM_TYPES.map((t) => ({
        type: t,
        r: calculateEstimate({ ...inputs, systemType: t, overrides: {}, removed: [], extras: [] }, rates),
      })),
    [inputs, rates],
  );

  function set<K extends keyof EstimateInputs>(key: K, value: EstimateInputs[K]) {
    setInputs((i) => ({ ...i, [key]: value }));
    setDirty(true);
  }

  function override(code: string, change: { quantity?: number | null; rate?: number | null }) {
    setInputs((i) => {
      const current = { ...(i.overrides[code] ?? {}) };
      for (const [k, v] of Object.entries(change) as Array<["quantity" | "rate", number | null]>) {
        if (v === null) delete current[k];
        else current[k] = v;
      }
      const overrides = { ...i.overrides };
      if (Object.keys(current).length) overrides[code] = current;
      else delete overrides[code];
      return { ...i, overrides };
    });
    setDirty(true);
  }

  async function save() {
    setPending(true);
    setError(null);
    const res = await saveEstimate({ id, name, phone, projectId: projectId || null, notes, inputs, reprice: repriced });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setDirty(false);
    if (!id) router.push(`/estimates/${res.id}`);
    else router.refresh();
  }

  function summaryText() {
    const r = result;
    const b = r.battery;
    return [
      `${SYSTEM_TYPE_LABEL[inputs.systemType]} solar system — ${r.dcCapacityKw} kWp`,
      `${inputs.segment === "COMMERCIAL" ? "Commercial" : "Residential"} · ${r.panelCount} × ${inputs.panelWp} Wp ${r.dcr ? "DCR" : "non-DCR"} panels`,
      b ? `Battery: ${b.chosen.units} × ${b.chosen.unitLabel} (${b.chosen.installedKwh} kWh), sized for ${b.loadKwh} kWh of backup` : null,
      ``,
      `Price without subsidy: ${inr(r.quoteWithGst)} (${inr(r.quoteBeforeGst)} + GST ${inr(r.gst)})`,
      `Price with subsidy: ${inr(r.customerPays)}${
        r.subsidy ? ` (PM Surya Ghar subsidy ${inr(r.subsidy)}, credited to your account)` : " (no subsidy applies)"
      }`,
      r.annualKwh ? `Expected generation: about ${r.annualKwh.toLocaleString("en-IN")} units a year` : null,
      r.paybackYears ? `Savings about ${inr(r.annualSavings)}/year — pays back in about ${r.paybackYears} years` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");
  }

  const removed = new Set(inputs.removed);
  const hasBattery = inputs.systemType !== "ON_GRID";

  return (
    <div className="flex flex-wrap items-start gap-4.5">
      {/* ── Inputs ── */}
      <div className="min-w-0 flex-[999_1_640px] space-y-4.5">
        {stale && currentRates ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3 text-[13px] text-[var(--amber-text)]">
            <span className="min-w-0 flex-1">
              Priced with the rate card as it was when saved. The rate card has changed since.
            </span>
            {canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setRates(currentRates);
                  setRepriced(true);
                  setDirty(true);
                }}
                className="h-9 cursor-pointer rounded-lg bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--amber-text)] ring-1 ring-[var(--amber-border)]"
              >
                Re-price at today&rsquo;s rates
              </button>
            ) : null}
          </div>
        ) : null}
        <section className={`${card} px-5 py-4.5`}>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="est-name">For whom</label>
              <input
                id="est-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="Customer name or a label"
                className={field}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="est-phone">Phone — optional</label>
              <input
                id="est-phone"
                value={phone}
                inputMode="tel"
                onChange={(e) => {
                  setPhone(e.target.value);
                  setDirty(true);
                }}
                className={`${field} ref`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="est-project">Attached to project — optional</label>
              <Combobox
                id="est-project"
                value={projectId}
                placeholder="Standalone — search a project to attach"
                emptyLabel="Detach — standalone"
                options={projects.map((p) => ({ value: p.id, label: p.label }))}
                onChange={(v) => {
                  setProjectId(v);
                  setDirty(true);
                  const p = projects.find((x) => x.id === v);
                  if (p && !name.trim()) setName(p.name);
                  if (p && !phone.trim() && p.phone) setPhone(p.phone);
                }}
              />
            </div>
          </div>
        </section>

        <Section title="What kind of system?" note="The type decides the inverter, whether there is a battery, and whether subsidy applies.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SYSTEM_TYPES.map((t) => {
              const on = inputs.systemType === t;
              const Icon = TYPE_ICON[t];
              const c = comparison.find((x) => x.type === t)!.r;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("systemType", t)}
                  className={`cursor-pointer rounded-[10px] px-4 py-3.5 text-left ${
                    on ? "bg-[var(--orange-soft)] ring-[1.5px] ring-[var(--orange)]" : "border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span className="mb-1.5 flex items-center gap-2">
                    <Icon size={17} strokeWidth={2.2} className={on ? "text-[var(--orange-text)]" : "text-[var(--muted)]"} aria-hidden />
                    <span className="text-[15px] font-bold">{SYSTEM_TYPE_LABEL[t]}</span>
                  </span>
                  <span className="block text-[12px] leading-snug text-[var(--muted)]">{SYSTEM_TYPE_BLURB[t]}</span>
                  <span className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--line-soft)] pt-2">
                    <span>
                      <span className="block text-[10.5px] font-semibold text-[var(--muted)]">Without subsidy</span>
                      <span className="num block text-[13px] font-bold">{inr(c.quoteWithGst)}</span>
                    </span>
                    <span>
                      <span className="block text-[10.5px] font-semibold text-[var(--muted)]">With subsidy</span>
                      <span className={`num block text-[13px] font-bold ${c.subsidy ? "text-[var(--green-text)]" : ""}`}>
                        {inr(c.customerPays)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Size and panels">
          <div className="mb-3.5 flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 8, 10].map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  set("capacityKw", kw);
                  set("panelCount", null);
                }}
                className={`h-9 min-w-12 cursor-pointer rounded-full px-3 text-[13px] font-bold ${
                  inputs.capacityKw === kw ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {kw} kW
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="est-kw">Capacity (kW)</label>
              <NumberBox id="est-kw" value={inputs.capacityKw} onValue={(v) => set("capacityKw", v ?? 0)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="est-wp">Panel (Wp)</label>
              <NumberBox id="est-wp" value={inputs.panelWp} onValue={(v) => set("panelWp", v ?? 550)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="est-count">Panels</label>
              <NumberBox
                id="est-count"
                value={inputs.panelCount ?? null}
                placeholder={`${result.panelCount} (auto)`}
                onValue={(v) => set("panelCount", v && v > 0 ? v : null)}
              />
            </div>
            <div>
              <span className={labelCls}>Phase</span>
              <div className="flex h-11 rounded-lg border border-[var(--line)] p-1">
                {(["SINGLE", "THREE"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set("phase", p)}
                    className={`flex-1 cursor-pointer rounded-md text-[13px] font-semibold ${
                      inputs.phase === p ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {p === "SINGLE" ? "1-phase" : "3-phase"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Toggle
              label="Customer"
              value={inputs.segment}
              onChange={(v) => set("segment", v)}
              options={[
                ["RESIDENTIAL", "Residential"],
                ["COMMERCIAL", "Commercial"],
              ]}
            />
            <Toggle
              label="Opting for subsidy"
              value={inputs.segment === "COMMERCIAL" ? "NO" : inputs.optSubsidy ? "YES" : "NO"}
              disabled={inputs.segment === "COMMERCIAL" ? "Commercial is not eligible" : null}
              onChange={(v) => set("optSubsidy", v === "YES")}
              options={[
                ["YES", "Yes"],
                ["NO", "No"],
              ]}
            />
            <Toggle
              label="Panels"
              value={result.dcr ? "DCR" : "NON_DCR"}
              disabled={result.dcrLocked}
              onChange={(v) => set("dcr", v === "DCR")}
              options={[
                ["DCR", "DCR"],
                ["NON_DCR", "Non-DCR"],
              ]}
            />
          </div>
          <p className={`mt-2.5 rounded-lg px-3 py-2 text-[12px] ${result.subsidy ? "bg-[var(--green-soft)] text-[var(--green-text)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
            {result.subsidy
              ? `Eligible for PM Surya Ghar subsidy of ${inr(result.subsidy)} on ${result.dcCapacityKw} kWp of DCR panels.`
              : `No subsidy: ${result.noSubsidyReason ?? "not eligible"}. ${result.dcr ? "DCR" : "Non-DCR"} panels priced.`}
          </p>
          <p className="mt-2 text-[12px] text-[var(--muted)]">
            {result.panelCount} panels × {inputs.panelWp} Wp = <span className="font-semibold text-[var(--ink)]">{result.dcCapacityKw} kWp</span> on the roof.
          </p>
        </Section>

        {hasBattery && result.battery ? (
          <Section
            title="Battery calculator"
            note={`What must keep running in a power cut, and for how long. The bank is built at ${systemVoltage(inputs.capacityKw)} V for a ${inputs.capacityKw} kW ${inputs.systemType === "HYBRID" ? "hybrid inverter" : "PCU"}.`}
          >
            <BatteryCalculatorPanel inputs={inputs} plan={result.battery} set={set} />
          </Section>
        ) : null}

        <Section title="Site assumptions" note="Distances before anyone has measured. Cable sizes and lengths follow from these.">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {(
              [
                ["roofToInverterM", "Roof to inverter (m)"],
                ["inverterToMeterM", "Inverter to meter (m)"],
                ["earthingRunM", "Earthing run (m)"],
                ["laRunM", "LA cable run (m)"],
              ] as const
            ).map(([k, l]) => (
              <div key={k}>
                <label className={labelCls} htmlFor={`est-${k}`}>{l}</label>
                <NumberBox id={`est-${k}`} value={inputs[k]} onValue={(v) => set(k, v ?? 0)} />
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-[var(--muted)]">AC cable</span>
            <div className="flex h-10 rounded-lg border border-[var(--line)] p-1">
              {(
                [
                  ["AUTO", inputs.phase === "THREE" ? "Auto (armoured)" : "Auto (flexible)"],
                  ["FLEX", "Flexible"],
                  ["ARMOURED", "Armoured"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("acCable", v)}
                  className={`cursor-pointer rounded-md px-3 text-[12.5px] font-semibold ${
                    inputs.acCable === v ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "text-[var(--muted)]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2.5 text-[12px] text-[var(--muted)]">
            DC: <span className="font-semibold text-[var(--ink)]">{result.cable.dcSqmm} sq mm</span> solar cable · AC:{" "}
            <span className="font-semibold text-[var(--ink)]">
              {result.cable.ac.cores}-core {result.cable.ac.sqmm} sq mm {result.cable.ac.armoured ? "armoured" : "flexible"}
            </span>{" "}
            for {result.cable.ac.currentA} A with {result.cable.ac.dropPct}% voltage drop (kept under 2%).
          </p>
        </Section>

        {/* ── Lines ── */}
        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold">Bill of materials and services</h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                Proposed from the inputs above and the rate card. Change any quantity or rate; edited lines are marked.
              </p>
            </div>
            {Object.keys(inputs.overrides).length || inputs.removed.length ? (
              <button
                type="button"
                onClick={() => {
                  setInputs((i) => ({ ...i, overrides: {}, removed: [] }));
                  setDirty(true);
                }}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 text-[12.5px] font-semibold text-[var(--navy-text)] hover:bg-[var(--surface-2)]"
              >
                <RotateCcw size={13} aria-hidden />
                Undo all edits
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                  <th className="px-5 py-2.5">Item</th>
                  <th className="w-28 px-2 py-2.5">Qty</th>
                  <th className="w-16 px-2 py-2.5">Unit</th>
                  <th className="w-32 px-2 py-2.5">Rate (₹)</th>
                  <th className="w-32 px-3 py-2.5 text-right">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {LINE_GROUPS.map((group) => {
                  const of = result.lines.filter((l) => l.group === group && !l.code.startsWith("EXTRA_"));
                  if (!of.length) return null;
                  return [
                    <tr key={`g-${group}`} className="bg-[var(--surface-2)]/60">
                      <td colSpan={6} className="px-5 pt-3 pb-1.5 text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                        <span className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: GROUP_COLOR[group] }} />
                        {group}
                      </td>
                    </tr>,
                    ...of.map((l) => <LineRow key={l.code} line={l} canWrite={canWrite} onOverride={override} onRemove={() => set("removed", [...inputs.removed, l.code])} />),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[var(--line-soft)] px-5 py-3.5">
            <h3 className="mb-2 text-[13px] font-bold">Other lines</h3>
            {inputs.extras.map((e, n) => (
              <div key={n} className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  value={e.label}
                  placeholder="e.g. Crane hire, extra wiring"
                  onChange={(ev) => set("extras", inputs.extras.map((x, j) => (j === n ? { ...x, label: ev.target.value } : x)))}
                  className={`${field} h-10 min-w-48 flex-[2_1_200px]`}
                />
                <NumberBox className={`${field} h-10 w-20`} ariaLabel="Quantity" value={e.quantity} onValue={(v) => set("extras", inputs.extras.map((x, j) => (j === n ? { ...x, quantity: v ?? 0 } : x)))} />
                <input
                  value={e.unit}
                  aria-label="Unit"
                  onChange={(ev) => set("extras", inputs.extras.map((x, j) => (j === n ? { ...x, unit: ev.target.value } : x)))}
                  className={`${field} h-10 w-20`}
                />
                <NumberBox className={`${field} h-10 w-28`} ariaLabel="Rate" placeholder="Rate" value={e.rate || null} onValue={(v) => set("extras", inputs.extras.map((x, j) => (j === n ? { ...x, rate: v ?? 0 } : x)))} />
                <span className="num w-24 text-right text-[14px] font-bold">{inr(e.quantity * e.rate)}</span>
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => set("extras", inputs.extras.filter((_, j) => j !== n))}
                  className="grid h-10 w-8 cursor-pointer place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--red-soft)] hover:text-[var(--red-text)]"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => set("extras", [...inputs.extras, { label: "", quantity: 1, unit: "piece", rate: 0 }])}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] px-3 text-[12.5px] font-bold text-[var(--navy-text)]"
              >
                <Plus size={13} aria-hidden />
                Add a line
              </button>
              {inputs.removed.length ? (
                <span className="text-[12px] text-[var(--muted)]">
                  Removed:{" "}
                  {inputs.removed.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => set("removed", inputs.removed.filter((c) => c !== code))}
                      className="mr-1.5 cursor-pointer rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-semibold text-[var(--navy-text)] hover:underline"
                      title="Put it back"
                    >
                      {code.toLowerCase().replace(/_/g, " ")} ↺
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <Section title="Pricing assumptions">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="est-margin">Margin on cost (%)</label>
              <NumberBox id="est-margin" value={inputs.marginPct} onValue={(v) => set("marginPct", v ?? 0)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="est-gst">GST (%)</label>
              <NumberBox id="est-gst" value={inputs.gstPct} onValue={(v) => set("gstPct", v ?? 0)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="est-tariff">Tariff (₹/unit)</label>
              <NumberBox id="est-tariff" value={inputs.tariff} onValue={(v) => set("tariff", v ?? 0)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="est-yield">Units/kW/day</label>
              <NumberBox id="est-yield" value={inputs.yieldPerKwDay} onValue={(v) => set("yieldPerKwDay", v ?? 4.2)} />
            </div>
          </div>
          <p className="mt-2.5 text-[12px] text-[var(--muted)]">
            GST 8.9% is the usual 70:30 split for rooftop solar — 5% on the equipment, 18% on the service.
          </p>
          <div className="mt-3.5">
            <label className={labelCls} htmlFor="est-notes">Notes</label>
            <textarea
              id="est-notes"
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="Roof type, shading, what the customer asked for…"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--orange)]"
            />
          </div>
        </Section>
      </div>

      {/* ── Summary ── */}
      <aside className="min-w-72 flex-[1_1_330px] lg:sticky lg:top-4">
        <section className="overflow-hidden rounded-[var(--radius)] bg-[var(--navy)] text-[var(--navy-ink)] shadow-[var(--shadow-panel)]">
          <div className="px-6 pt-5 pb-4">
            <div className="text-[12px] font-semibold tracking-[0.04em] uppercase opacity-70">
              Quote · {SYSTEM_TYPE_LABEL[inputs.systemType]} {result.dcCapacityKw} kWp
            </div>
            {/* Both prices, equal weight: the customer weighs one against the other. */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11.5px] font-semibold opacity-70">Without subsidy</div>
                <div className="num mt-1 text-[24px] leading-tight font-extrabold">{inr(result.quoteWithGst)}</div>
              </div>
              <div className="border-l border-white/15 pl-3">
                <div className="text-[11.5px] font-semibold opacity-70">With subsidy</div>
                <div className={`num mt-1 text-[24px] leading-tight font-extrabold ${result.subsidy ? "text-[var(--green)]" : ""}`}>
                  {inr(result.customerPays)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[12px] opacity-75">
              {inr(result.quoteBeforeGst)} + GST {inr(result.gst)} ·{" "}
              {result.subsidy
                ? `PM Surya Ghar subsidy ${inr(result.subsidy)}, credited to the customer`
                : `no subsidy — ${result.noSubsidyReason ?? "not eligible"}`}
            </div>
          </div>

          <div className="px-6 py-4">
            {[
              ["Our cost", inr(result.cost)],
              ["Margin", `${inr(result.margin)} (${result.cost ? Math.round((result.margin / result.cost) * 100) : 0}%)`],
              ["Cost per watt", `₹${result.costPerWatt.toFixed(2)}`],
              [
                "Quote per watt",
                result.dcCapacityKw
                  ? `₹${(result.quoteWithGst / (result.dcCapacityKw * 1000)).toFixed(2)} · ₹${(result.customerPays / (result.dcCapacityKw * 1000)).toFixed(2)} with subsidy`
                  : "—",
              ],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-1">
                <span className="text-[13px] opacity-75">{k}</span>
                <span className="num text-[14px] font-semibold">{v}</span>
              </div>
            ))}

            {/* Cost split, one bar */}
            <div className="mt-3.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-white/15">
              {result.byGroup.map((g) => (
                <span key={g.group} title={`${g.group}: ${inr(g.amount)}`} style={{ width: `${(g.amount / result.cost) * 100}%`, backgroundColor: GROUP_COLOR[g.group] }} />
              ))}
            </div>
            <ul className="mt-2.5 space-y-1">
              {result.byGroup.map((g) => (
                <li key={g.group} className="flex items-center gap-2 text-[12px]">
                  <span className="block h-2 w-2 rounded-[2px]" style={{ backgroundColor: GROUP_COLOR[g.group] }} />
                  <span className="flex-1 opacity-80">{g.group}</span>
                  <span className="num font-semibold">{inr(g.amount)}</span>
                  <span className="num w-9 text-right opacity-60">{Math.round((g.amount / result.cost) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-white/10 px-6 py-4">
            {[
              ["Generation", `${result.annualKwh.toLocaleString("en-IN")} units/yr`],
              ...(result.annualSavings ? [["Bill savings", `${inr(result.annualSavings)}/yr`]] : []),
              ...(result.paybackYears ? [["Payback", `${result.paybackYears} years`]] : []),
              ...(result.battery
                ? [
                    ["Battery", `${result.battery.chosen.units} × ${result.battery.chosen.unitLabel}`],
                    ["Backup energy", `${result.battery.chosen.usableKwh} kWh usable`],
                  ]
                : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-1">
                <span className="text-[13px] opacity-75">{k}</span>
                <span className="num text-[14px] font-semibold">{v}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-3.5 space-y-2.5">
          {error ? (
            <p role="alert" className="rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
              {error}
            </p>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={save}
              className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--orange)] text-sm font-bold text-[var(--orange-ink)] disabled:opacity-50"
            >
              {dirty ? <Save size={15} aria-hidden /> : <Check size={15} aria-hidden />}
              {pending ? "Saving…" : dirty ? (id ? "Save changes" : "Save estimate") : `Saved${number ? ` · ${number}` : ""}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(summaryText());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-sm font-semibold text-[var(--navy-text)] hover:bg-[var(--surface-2)]"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Copied — paste into WhatsApp" : "Copy summary for the customer"}
          </button>
          {id && canWrite ? (
            <button
              type="button"
              onClick={async () => {
                const a = await ask({ title: "Delete this estimate?", body: "It disappears from the list. Nothing else changes.", confirmLabel: "Delete" });
                if (!a.confirmed) return;
                await deleteEstimate(id);
                router.push("/estimates");
              }}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-[13px] font-semibold text-[var(--muted)] hover:text-[var(--red-text)]"
            >
              <Trash2 size={14} aria-hidden />
              Delete estimate
            </button>
          ) : null}
          <p className="px-1 text-[11.5px] leading-snug text-[var(--muted)]">
            An estimate is for pricing only. It never counts as an expense or towards a project&rsquo;s real cost.
          </p>
        </div>
      </aside>
    </div>
  );
}

function LineRow({
  line,
  canWrite,
  onOverride,
  onRemove,
}: {
  line: EstimateLine;
  canWrite: boolean;
  onOverride: (code: string, change: { quantity?: number | null; rate?: number | null }) => void;
  onRemove: () => void;
}) {
  const cell = "h-10 w-full rounded-lg border bg-[var(--surface)] px-2.5 text-right text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
  return (
    <tr className="border-b border-[var(--line-soft)] align-top">
      <td className="px-5 py-2.5">
        <div className="text-[13.5px] font-semibold">
          {line.label}
          {line.edited ? (
            <span className="ml-2 rounded-full bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--amber-text)] uppercase">edited</span>
          ) : null}
        </div>
        <div className="text-[11.5px] text-[var(--muted)]">{line.basis}</div>
      </td>
      <td className="px-2 py-2.5">
        <NumberBox
          ariaLabel={`${line.label} quantity`}
          className={`${cell} border-[var(--line)]`}
          value={line.quantity}
          onValue={(v) => onOverride(line.code, { quantity: v })}
        />
      </td>
      <td className="px-2 py-4 text-[12.5px] text-[var(--muted)]">{line.unit}</td>
      <td className="px-2 py-2.5">
        <NumberBox
          ariaLabel={`${line.label} rate`}
          className={`${cell} border-[var(--line)]`}
          value={line.rate}
          onValue={(v) => onOverride(line.code, { rate: v })}
        />
      </td>
      <td className="num px-3 py-4 text-right text-[14px] font-bold">{inr(line.amount)}</td>
      <td className="py-2.5 pr-3">
        {canWrite ? (
          <button
            type="button"
            aria-label={`Remove ${line.label}`}
            onClick={onRemove}
            className="grid h-10 w-8 cursor-pointer place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--red-soft)] hover:text-[var(--red-text)]"
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
