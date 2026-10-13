"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveBatteryBank, savePanelSerials } from "@/app/actions/installation";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

/**
 * One row per module.
 *
 * Paste accepts a whole column from a scanner app or a spreadsheet — on a
 * 10 kW roof that is eighteen serials, and typing them twice is how they
 * end up wrong.
 */
export function PanelSerials({
  projectId,
  initial,
  expected,
}: {
  projectId: string;
  initial: string[];
  expected: number;
}) {
  const router = useRouter();
  const [serials, setSerials] = useState<string[]>(initial.length ? initial : [""]);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = serials.filter((s) => s.trim()).length;
  const duplicates = new Set(
    serials.filter((s, i) => s.trim() && serials.findIndex((o) => o.trim() === s.trim()) !== i),
  );

  function handlePaste(index: number, text: string) {
    const parts = text
      .split(/[\r\n\t,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) return false;
    setSerials((list) => {
      const next = [...list];
      next.splice(index, 1, ...parts);
      return next;
    });
    setSaved(false);
    return true;
  }

  async function save() {
    setPending(true);
    setError(null);
    const result = await savePanelSerials(projectId, serials);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h3 className="flex-1 text-base font-bold">Panel serial numbers</h3>
        <span
          className={`ref text-[12.5px] font-semibold ${
            expected > 0 && filled >= expected
              ? "text-[var(--green-text)]"
              : "text-[var(--amber-text)]"
          }`}
        >
          {filled}{expected > 0 ? ` of ${expected}` : ""}
        </span>
      </div>
      <p className="mb-3.5 text-[13px] text-[var(--muted)]">
        Paste a whole column from the scanner app into any box and it will split across rows.
      </p>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {serials.map((s, i) => {
          const dup = s.trim() !== "" && duplicates.has(s);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="ref w-6 shrink-0 text-right text-[11.5px] text-[var(--muted)]">
                {i + 1}
              </span>
              <input
                aria-label={`Panel ${i + 1} serial`}
                value={s}
                onChange={(e) => {
                  const v = e.target.value;
                  setSerials((list) => list.map((o, j) => (j === i ? v : o)));
                  setSaved(false);
                }}
                onPaste={(e) => {
                  if (handlePaste(i, e.clipboardData.getData("text"))) e.preventDefault();
                }}
                placeholder="WS07269074296330"
                className={`${cell} ref ${dup ? "border-[var(--red-text)]" : ""}`}
              />
              <button
                type="button"
                aria-label={`Remove panel ${i + 1}`}
                onClick={() => {
                  setSerials((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [""]));
                  setSaved(false);
                }}
                className="h-10 w-10 shrink-0 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--red-text)]"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {duplicates.size > 0 ? (
        <p className="mb-3 text-[12.5px] font-medium text-[var(--red-text)]">
          The same serial appears more than once. Two panels cannot share one.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => {
            setSerials((l) => [...l, ""]);
            setSaved(false);
          }}
          className="h-11 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy)]"
        >
          + Add a panel
        </button>
        <button
          type="button"
          disabled={pending || duplicates.size > 0}
          onClick={save}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save serials"}
        </button>
      </div>
    </div>
  );
}

/** Only rendered when the system is hybrid. */
export function BatteryBank({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    manufacturer: string;
    batteryType: string;
    cellCapacity: string;
    seriesCount: string;
    parallelCount: string;
    totalCapacity: string;
    totalVoltage: string;
    serials: string[];
  };
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<typeof initial>) => {
    setV((o) => ({ ...o, ...patch }));
    setSaved(false);
  };

  const fields: Array<[keyof typeof initial, string, string?]> = [
    ["manufacturer", "Manufacturer", "Luminous"],
    ["batteryType", "Battery type", "Lithium LFP"],
    ["cellCapacity", "Capacity of each cell", "100 Ah"],
    ["seriesCount", "Cells in series", "4"],
    ["parallelCount", "Strings in parallel", "1"],
    ["totalVoltage", "Total voltage", "51.2 V"],
    ["totalCapacity", "Total capacity", "5.12 kWh"],
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border-[1.5px] border-[var(--orange)]">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--orange-border)] bg-[var(--amber-surface)] px-5 py-3.5">
        <h3 className="flex-1 text-base font-bold">Battery bank</h3>
        <span className="text-[11.5px] font-bold text-[var(--orange-text)]">
          Shown because the system is hybrid
        </span>
      </div>

      <div className="px-5 py-4.5">
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {fields.map(([key, label, placeholder]) => (
            <div key={key}>
              <label className={labelCls} htmlFor={`bb-${key}`}>{label}</label>
              <input
                id={`bb-${key}`}
                value={v[key] as string}
                onChange={(e) => set({ [key]: e.target.value } as Partial<typeof initial>)}
                placeholder={placeholder}
                className={`${cell} ref`}
              />
            </div>
          ))}
        </div>

        <label className={labelCls} htmlFor="bb-serials">Cell serial numbers</label>
        <textarea
          id="bb-serials"
          rows={3}
          value={v.serials.join("\n")}
          onChange={(e) => set({ serials: e.target.value.split(/\r?\n/) })}
          placeholder={"LUM-LFP-77120\nLUM-LFP-77121"}
          className="ref mb-3.5 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13.5px] outline-none focus:border-[var(--orange)]"
        />

        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await saveBatteryBank(projectId, { ...v, serials: v.serials });
            setPending(false);
            setSaved(true);
            router.refresh();
          }}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save battery bank"}
        </button>
      </div>
    </div>
  );
}
