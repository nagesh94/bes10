"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveEarthing, saveMaterial, type MaterialInput } from "@/app/actions/installation";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

const CATEGORY_LABEL: Record<MaterialInput["category"], string> = {
  AC: "AC wire",
  DC: "DC wire",
  LA: "Lightning arrester",
  EARTHING: "Earthing wire",
};

const CORE_OPTIONS = ["single core", "multi core"];
const CONDUCTOR_OPTIONS = ["copper", "aluminium"];

/**
 * What was actually consumed.
 *
 * Make, size, core and conductor are separate because the work completion
 * report asks for "Make / Name of manufacturer" and "Size & Type" as their
 * own lines — assembling them at print time from one free-text field would
 * guess wrong.
 */
export function MaterialForm({
  projectId,
  initial,
  cableMakeOptions = [],
}: {
  projectId: string;
  initial: MaterialInput[];
  /** From the cable-makes master list. Typing one not on the list is still allowed. */
  cableMakeOptions?: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<MaterialInput[]>(
    initial.length
      ? initial
      : (["AC", "DC", "LA", "EARTHING"] as const).map((category) => ({
          category,
          make: "",
          lengthM: "",
          sizeSqmm: "",
          coreType: "single core",
          conductor: "copper",
        })),
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<MaterialInput>) => {
    setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  /** A category already used by another row cannot be picked again. */
  const availableFor = (index: number) => {
    const used = new Set(rows.filter((_, j) => j !== index).map((r) => r.category));
    return (Object.keys(CATEGORY_LABEL) as Array<MaterialInput["category"]>).filter(
      (c) => !used.has(c) || c === rows[index]!.category,
    );
  };

  return (
    <div>
      <h3 className="mb-0.5 text-base font-bold">Material used</h3>
      <p className="mb-4 text-[13px] text-[var(--muted)]">
        The actual runs, not the survey estimate. These print straight into the work completion
        report.
      </p>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <select
                aria-label={`Run ${i + 1} category`}
                value={r.category}
                onChange={(e) => update(i, { category: e.target.value as MaterialInput["category"] })}
                className="h-9 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] font-semibold"
              >
                {availableFor(i).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </select>
              <span className="flex-1" />
              <button
                type="button"
                aria-label={`Remove run ${i + 1}`}
                onClick={() => {
                  setRows((l) => l.filter((_, j) => j !== i));
                  setSaved(false);
                }}
                className="h-9 w-9 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--red-text)]"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
              <div>
                <label className={labelCls} htmlFor={`mk-${i}`}>Make</label>
                <input
                  id={`mk-${i}`}
                  list={`makes-${i}`}
                  value={r.make}
                  onChange={(e) => update(i, { make: e.target.value })}
                  placeholder="Polycab"
                  className={cell}
                />
                <datalist id={`makes-${i}`}>
                  {cableMakeOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls} htmlFor={`ln-${i}`}>Length (m)</label>
                <input
                  id={`ln-${i}`}
                  value={r.lengthM}
                  onChange={(e) => update(i, { lengthM: e.target.value.replace(/[^0-9.]/g, "") })}
                  inputMode="decimal"
                  placeholder="32"
                  className={`${cell} ref`}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor={`sz-${i}`}>Size (sqmm)</label>
                <input
                  id={`sz-${i}`}
                  value={r.sizeSqmm}
                  onChange={(e) => update(i, { sizeSqmm: e.target.value.replace(/[^0-9.]/g, "") })}
                  inputMode="decimal"
                  placeholder="4"
                  className={`${cell} ref`}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor={`co-${i}`}>Core</label>
                <select
                  id={`co-${i}`}
                  value={r.coreType}
                  onChange={(e) => update(i, { coreType: e.target.value })}
                  className={cell}
                >
                  {CORE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor={`cd-${i}`}>Conductor</label>
                <select
                  id={`cd-${i}`}
                  value={r.conductor}
                  onChange={(e) => update(i, { conductor: e.target.value })}
                  className={cell}
                >
                  {CONDUCTOR_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(() => {
        const unused = (Object.keys(CATEGORY_LABEL) as Array<MaterialInput["category"]>).filter(
          (c) => !rows.some((r) => r.category === c),
        );
        return unused.length ? (
          <button
            type="button"
            onClick={() => {
              setRows((l) => [
                ...l,
                { category: unused[0]!, make: "", lengthM: "", sizeSqmm: "", coreType: "single core", conductor: "copper" },
              ]);
              setSaved(false);
            }}
            className="mt-3.5 h-11 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy)]"
          >
            + Add {CATEGORY_LABEL[unused[0]!].toLowerCase()}
          </button>
        ) : null;
      })()}

      {error ? (
        <p role="alert" className="mt-3.5 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await saveMaterial(projectId, rows);
            setPending(false);
            if (!result.ok) return setError(result.error);
            setSaved(true);
            router.refresh();
          }}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save material"}
        </button>
      </div>
    </div>
  );
}

/** Measured on site. Under 2 Ω or the DISCOM will not pass it. */
export function EarthingForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    resistanceOhms: string;
    wireSize: string;
    wireType: string;
    twoSeparatePoints: boolean;
    cautionSignage: boolean;
    omManualProvided: boolean;
  };
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const ohms = Number(v.resistanceOhms);
  const measured = v.resistanceOhms.trim() !== "" && Number.isFinite(ohms);
  const passes = measured && ohms < 2;

  const set = (patch: Partial<typeof initial>) => {
    setV((o) => ({ ...o, ...patch }));
    setSaved(false);
  };

  const toggles: Array<[keyof typeof initial, string]> = [
    ["twoSeparatePoints", "Two separate earthing points"],
    ["cautionSignage", "Caution signage fitted"],
    ["omManualProvided", "O&M manual given to the customer"],
  ];

  return (
    <div>
      <h3 className="mb-0.5 text-base font-bold">Earthing</h3>
      <p className="mb-4 text-[13px] text-[var(--muted)]">
        Measured on site. The DISCOM limit is under 2 ohms.
      </p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="ohms">Measured resistance</label>
          <div className="flex items-center gap-2">
            <input
              id="ohms"
              value={v.resistanceOhms}
              onChange={(e) => set({ resistanceOhms: e.target.value.replace(/[^0-9.]/g, "") })}
              inputMode="decimal"
              placeholder="1.2"
              className={`${cell} ref ${measured ? (passes ? "border-[var(--green)]" : "border-[var(--red-text)]") : ""}`}
            />
            <span className="shrink-0 text-sm text-[var(--muted)]">Ω</span>
          </div>
          {measured ? (
            <p
              className={`mt-1.5 text-[11.5px] font-semibold ${
                passes ? "text-[var(--green-text)]" : "text-[var(--red-text)]"
              }`}
            >
              {passes ? "Under 2 Ω — passes" : "2 Ω or over — the DISCOM will not pass this"}
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelCls} htmlFor="wireSize">Earth wire size (sqmm)</label>
          <input
            id="wireSize"
            value={v.wireSize}
            onChange={(e) => set({ wireSize: e.target.value.replace(/[^0-9.]/g, "") })}
            inputMode="decimal"
            placeholder="4"
            className={`${cell} ref`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="wireType">Wire type</label>
          <input id="wireType" value={v.wireType} onChange={(e) => set({ wireType: e.target.value })} placeholder="Copper and G.I." className={cell} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-5">
        {toggles.map(([key, label]) => (
          <div key={key}>
            <div className={labelCls}>{label}</div>
            <div className="inline-flex rounded-lg bg-[var(--surface-sunken)] p-[3px]">
              {[true, false].map((b) => (
                <button
                  key={String(b)}
                  type="button"
                  aria-pressed={v[key] === b}
                  onClick={() => set({ [key]: b } as Partial<typeof initial>)}
                  className={`h-9 cursor-pointer rounded-md px-4 text-[13px] ${
                    v[key] === b
                      ? "bg-[var(--orange)] font-bold text-[var(--orange-ink)]"
                      : "font-semibold text-[var(--muted)]"
                  }`}
                >
                  {b ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await saveEarthing(projectId, v);
          setPending(false);
          setSaved(true);
          router.refresh();
        }}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save earthing"}
      </button>
    </div>
  );
}
