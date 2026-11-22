"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BatteryCharging, Check, Plus, Search, X } from "lucide-react";
import {
  APPLIANCE_CATEGORIES,
  APPLIANCE_LIBRARY,
  LOAD_PRESETS,
  type ApplianceCategory,
  type Appliance,
  type BatteryPlan,
  type EstimateInputs,
} from "@/lib/estimator/engine";

/**
 * Battery sizing for someone who does not size batteries.
 *
 * Start from a preset home, adjust what has to keep running and for how
 * long, and the calculator works out the energy that means, adds back what
 * the inverter loses, and shows what it takes in tubular lead-acid and in
 * lithium — priced, side by side, with one click to use either.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const cell =
  "h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

function Num({ value, onValue, ariaLabel, className = cell }: { value: number; onValue: (n: number) => void; ariaLabel: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text ?? String(value)}
      onFocus={() => setText(String(value))}
      onBlur={() => setText(null)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onValue(n);
      }}
      className={`${className} ref text-right`}
    />
  );
}

export function BatteryCalculator({
  inputs,
  plan,
  set,
}: {
  inputs: EstimateInputs;
  plan: BatteryPlan;
  set: <K extends keyof EstimateInputs>(key: K, value: EstimateInputs[K]) => void;
}) {
  const appliances = inputs.appliances;
  const patch = (n: number, change: Partial<Appliance>) =>
    set("appliances", appliances.map((a, j) => (j === n ? { ...a, ...change } : a)));

  const chosenKey = `${plan.chosen.chemistry}-${plan.chosen.ah}`;

  return (
    <div className="space-y-4">
      {/* How the load is described */}
      <div className="flex h-10 max-w-md rounded-lg border border-[var(--line)] p-1">
        {(
          [
            ["APPLIANCES", "Pick appliances"],
            ["SIMPLE", "I know the load in kW"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => set("loadMode", v)}
            className={`flex-1 cursor-pointer rounded-md text-[12.5px] font-semibold ${
              inputs.loadMode === v ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "text-[var(--muted)]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {inputs.loadMode === "SIMPLE" ? (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Load to back up (kW)</label>
            <Num ariaLabel="Load in kW" className={`${cell} h-11`} value={inputs.backupLoadKw} onValue={(v) => set("backupLoadKw", v)} />
          </div>
          <div>
            <label className={labelCls}>Hours of backup</label>
            <Num ariaLabel="Hours" className={`${cell} h-11`} value={inputs.backupHours} onValue={(v) => set("backupHours", v)} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <span className="self-center text-[12px] font-semibold text-[var(--muted)]">Start from:</span>
            {LOAD_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => set("appliances", p.appliances)}
                className="h-8 cursor-pointer rounded-full bg-[var(--surface-2)] px-3 text-[12px] font-semibold text-[var(--navy-text)] hover:bg-[var(--navy-soft)]"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="bg-[var(--surface-2)] text-[11px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                  <th className="px-3 py-2">Appliance</th>
                  <th className="w-20 px-2 py-2">Watts</th>
                  <th className="w-16 px-2 py-2">Qty</th>
                  <th className="w-20 px-2 py-2">Hours</th>
                  <th className="w-24 px-2 py-2 text-right">Energy</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {appliances.map((a, n) => (
                  <tr key={n} className="border-t border-[var(--line-soft)]">
                    <td className="px-3 py-1.5">
                      <input
                        value={a.name}
                        aria-label="Appliance"
                        onChange={(e) => patch(n, { name: e.target.value })}
                        className={`${cell} text-left`}
                      />
                      {a.duty < 1 ? <div className="mt-0.5 text-[11px] text-[var(--muted)]">runs about {Math.round(a.duty * 100)}% of the time</div> : null}
                    </td>
                    <td className="px-2 py-1.5"><Num ariaLabel="Watts" value={a.watts} onValue={(v) => patch(n, { watts: v })} /></td>
                    <td className="px-2 py-1.5"><Num ariaLabel="Quantity" value={a.qty} onValue={(v) => patch(n, { qty: Math.round(v) })} /></td>
                    <td className="px-2 py-1.5"><Num ariaLabel="Hours" value={a.hours} onValue={(v) => patch(n, { hours: v })} /></td>
                    <td className="num px-2 py-1.5 text-right text-[13px] font-semibold">
                      {((a.qty * a.watts * a.hours * a.duty) / 1000).toFixed(2)} kWh
                    </td>
                    <td className="pr-2">
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => set("appliances", appliances.filter((_, j) => j !== n))}
                        className="grid h-9 w-7 cursor-pointer place-items-center rounded-md text-[var(--muted)] hover:text-[var(--red-text)]"
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AppliancePicker
            onAdd={(a) => {
              // Adding one already on the list adds to its count instead.
              const at = appliances.findIndex((x) => x.name === a.name);
              if (at >= 0) patch(at, { qty: appliances[at]!.qty + 1 });
              else set("appliances", [...appliances, { name: a.name, watts: a.watts, qty: 1, hours: a.hours, duty: a.duty }]);
            }}
            onOther={() => set("appliances", [...appliances, { name: "Other", watts: 100, qty: 1, hours: 4, duty: 1 }])}
          />
        </>
      )}

      {/* What that means */}
      <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-[var(--surface-2)] px-4 py-3 text-[12.5px] sm:grid-cols-4">
        {[
          ["Energy used", `${plan.loadKwh} kWh`],
          ["Bank must hold", `${plan.neededKwh} kWh`],
          ["Running load", `${plan.peakKw} kW`],
          ["Bank voltage", `${plan.systemVoltage} V`],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[var(--muted)]">{k}</div>
            <div className="num text-[15px] font-bold">{v}</div>
          </div>
        ))}
        <div className="col-span-full text-[11.5px] text-[var(--muted)]">
          The bank holds the energy plus 10% the inverter loses. Tubular batteries are used only to half their charge;
          lithium to 90%, which is why lithium needs far less capacity for the same backup.
        </div>
      </div>

      {plan.inverterTooSmall ? (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3.5 py-2.5 text-[12.5px] text-[var(--amber-text)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          Everything on at once draws {plan.peakKw} kW, more than the {inputs.capacityKw} kW inverter. Either a bigger
          inverter, or these loads cannot all run together in a cut.
        </p>
      ) : null}

      {/* The options */}
      <div>
        <h3 className="mb-2 text-[13px] font-bold">What it takes</h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {plan.options.map((o) => {
            const key = `${o.chemistry}-${o.ah}`;
            const on = key === chosenKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  set("chemistry", o.chemistry);
                  if (o.chemistry === "LEAD_ACID") set("leadAcidAh", o.ah);
                  else set("lithiumAh", o.ah);
                }}
                className={`cursor-pointer rounded-[10px] px-3.5 py-3 text-left ${
                  on ? "bg-[var(--orange-soft)] ring-[1.5px] ring-[var(--orange)]" : "border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[13.5px] font-bold">
                    {o.units} × {o.unitLabel}
                  </span>
                  {on ? <Check size={15} className="text-[var(--orange-text)]" aria-label="In use" /> : null}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--muted)]">
                  {o.chemistry === "LEAD_ACID" ? `${o.series} in series × ${o.strings} string${o.strings > 1 ? "s" : ""}` : `${o.units} in parallel`} ·{" "}
                  {o.installedKwh} kWh installed, {o.usableKwh} kWh usable
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="num text-[15px] font-extrabold">{inr(o.price)}</span>
                  <span className="text-[11.5px] text-[var(--muted)]">
                    {o.coversHours ? `≈ ${o.coversHours} h at the average load` : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--muted)]">
          Lithium costs more up front but lasts roughly 3–4 times as many cycles and needs no water or ventilation.
          Prices come from the rate card.
        </p>
      </div>
    </div>
  );
}

/** Search or browse the appliance library by category, one click to add. */
function AppliancePicker({
  onAdd,
  onOther,
}: {
  onAdd: (a: (typeof APPLIANCE_LIBRARY)[number]) => void;
  onOther: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ApplianceCategory | "">("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return APPLIANCE_LIBRARY.filter(
      (a) => (!category || a.category === category) && (!q || `${a.name} ${a.category}`.toLowerCase().includes(q)),
    );
  }, [query, category]);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5">
        <Search size={14} className="text-[var(--muted-soft)]" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search appliances — lift, EV, geyser, cooler…"
          aria-label="Search appliances"
          className="h-9 w-full bg-transparent text-[13.5px] outline-none"
        />
      </div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {(["", ...APPLIANCE_CATEGORIES] as const).map((c) => (
          <button
            key={c || "all"}
            type="button"
            onClick={() => setCategory(c)}
            className={`h-7 cursor-pointer rounded-full px-2.5 text-[11.5px] font-semibold ${
              category === c ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {c || "All"}
          </button>
        ))}
      </div>
      <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {shown.map((a) => (
          <button
            key={a.name}
            type="button"
            onClick={() => {
              onAdd(a);
              setJustAdded(a.name);
              setTimeout(() => setJustAdded((x) => (x === a.name ? null : x)), 1200);
            }}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-left hover:border-[var(--orange)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{a.name}</span>
              <span className="block text-[11px] text-[var(--muted)]">
                {a.watts >= 1000 ? `${a.watts / 1000} kW` : `${a.watts} W`} · {a.category}
              </span>
            </span>
            {justAdded === a.name ? (
              <Check size={15} className="shrink-0 text-[var(--green-text)]" aria-label="Added" />
            ) : (
              <Plus size={15} className="shrink-0 text-[var(--navy-text)]" aria-hidden />
            )}
          </button>
        ))}
        {shown.length === 0 ? (
          <p className="col-span-full px-1 py-3 text-[12.5px] text-[var(--muted)]">Nothing matches — add it as something else.</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOther}
        className="mt-2.5 inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--navy-text)]"
      >
        <Plus size={13} aria-hidden /> Something not in the list
      </button>
    </div>
  );
}

/**
 * What the estimate page shows: the battery it settled on, at a glance,
 * and the full calculator in a dialog — the appliance list is too long to
 * sit in the middle of a bill of materials.
 */
export function BatteryCalculatorPanel(props: {
  inputs: EstimateInputs;
  plan: BatteryPlan;
  set: <K extends keyof EstimateInputs>(key: K, value: EstimateInputs[K]) => void;
}) {
  const { inputs, plan } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const c = plan.chosen;
  const items = inputs.loadMode === "SIMPLE" ? null : inputs.appliances.filter((a) => a.qty > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-[var(--navy-ink)]">
          <BatteryCharging size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-[1_1_220px]">
          <div className="text-[14px] font-bold">
            {c.units} × {c.unitLabel}
          </div>
          <div className="text-[12px] text-[var(--muted)]">
            {c.usableKwh} kWh usable for {plan.loadKwh} kWh of backup ·{" "}
            {items ? `${items.reduce((s, a) => s + a.qty, 0)} appliances` : `${inputs.backupLoadKw} kW for ${inputs.backupHours} h`} · running load{" "}
            {plan.peakKw} kW
          </div>
          {plan.inverterTooSmall ? (
            <div className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-[var(--amber-text)]">
              <AlertTriangle size={13} aria-hidden /> Load is more than the {inputs.capacityKw} kW inverter
            </div>
          ) : null}
        </div>
        <span className="num text-[16px] font-extrabold">{inr(c.price)}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)]"
        >
          Open battery calculator
        </button>
      </div>

      <dialog
        ref={ref}
        aria-labelledby="battery-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[calc(100vw-2rem)] max-w-[60rem] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop:bg-[rgba(2,11,24,0.78)] backdrop:backdrop-blur-[3px]"
      >
        {open ? (
          <div className="max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id="battery-dialog-title" className="text-[18px] font-bold">Battery calculator</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  What must run in a power cut, and for how long. Changes apply to the estimate as you go.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 cursor-pointer rounded-lg bg-[var(--navy)] px-4 text-[13px] font-bold text-[var(--navy-ink)]"
              >
                Done
              </button>
            </div>
            <div className="px-5 py-5">
              <BatteryCalculator {...props} />
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
