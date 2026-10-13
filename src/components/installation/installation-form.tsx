"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveInstallation, type InstallationInput } from "@/app/actions/installation";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

type Key = keyof InstallationInput;

const BLOCKS: Array<{
  title: string;
  note: string;
  fields: Array<{ key: Key; label: string; placeholder?: string; mono?: boolean; comboKey?: string }>;
}> = [
  {
    title: "Panels",
    note: "Modules actually mounted on the roof.",
    fields: [
      { key: "panelCompany", label: "Panel company", placeholder: "Waaree Energies Limited", comboKey: "panelCompanies" },
      { key: "panelModelNo", label: "Panel model number", placeholder: "BiN-08-535", mono: true, comboKey: "panelModels" },
      { key: "panelWattPeak", label: "Watt peak each", placeholder: "535", mono: true },
      { key: "totalPanels", label: "Total panels", placeholder: "9", mono: true },
      { key: "totalCapacityKw", label: "Total capacity (kW)", placeholder: "4.82", mono: true },
    ],
  },
  {
    title: "Inverter",
    note: "Serial and model as printed on the unit — manufacturer and brand name are the same thing, so there is one field for it.",
    fields: [
      { key: "inverterManufacturer", label: "Manufacturer", placeholder: "Polycab", comboKey: "inverterManufacturers" },
      { key: "inverterModelNo", label: "Model number", placeholder: "PSIS-5K0", mono: true, comboKey: "inverterModels" },
      { key: "inverterSerial", label: "Serial number", placeholder: "5K0110826-2626-404353P", mono: true },
      { key: "inverterCapacityKw", label: "AC capacity (kW)", placeholder: "5", mono: true },
      { key: "inverterCount", label: "Number of inverters", placeholder: "1", mono: true },
    ],
  },
  {
    title: "ACDB and DCDB",
    note: "Distribution boxes on either side of the inverter.",
    fields: [
      { key: "acdbMake", label: "ACDB make", placeholder: "Havells" },
      { key: "acdbSizeType", label: "ACDB size & type", placeholder: "5 kW moisture proof" },
      { key: "acdbSpd", label: "AC surge protection", placeholder: "Single SPD" },
      { key: "acdbMcb", label: "MCB / isolator", placeholder: "Isolators 1" },
      { key: "dcdbMake", label: "DCDB make", placeholder: "Havells" },
      { key: "dcdbSizeType", label: "DCDB size & type", placeholder: "5 kW moisture proof" },
      { key: "dcdbSpd", label: "DC surge protection", placeholder: "Single SPD" },
      { key: "dcdbMcb", label: "MCB / isolator", placeholder: "Isolators 1" },
    ],
  },
];

export function InstallationForm({
  projectId,
  initial,
  comboOptions = {},
}: {
  projectId: string;
  initial: InstallationInput;
  /** Suggestion lists for combo fields — master data, but manual entry always works. */
  comboOptions?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [v, setV] = useState<InstallationInput>(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const set = (patch: Partial<InstallationInput>) => {
    setV((o) => ({ ...o, ...patch }));
    setSaved(false);
  };

  return (
    <div>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <div>
          <label className={labelCls} htmlFor="installationDate">Installation date</label>
          <input
            id="installationDate"
            type="date"
            value={v.installationDate}
            onChange={(e) => set({ installationDate: e.target.value })}
            max={today}
            className={cell}
          />
        </div>
      </div>

      {BLOCKS.map((block) => (
        <section key={block.title} className="mb-5">
          <h3 className="mb-0.5 text-base font-bold">{block.title}</h3>
          <p className="mb-3 text-[13px] text-[var(--muted)]">{block.note}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            {block.fields.map((f) => (
              <div key={f.key}>
                <label className={labelCls} htmlFor={f.key}>{f.label}</label>
                <input
                  id={f.key}
                  value={v[f.key] as string}
                  onChange={(e) => set({ [f.key]: e.target.value } as Partial<InstallationInput>)}
                  {...(f.placeholder ? { placeholder: f.placeholder } : {})}
                  {...(f.comboKey ? { list: `${f.key}-combo` } : {})}
                  autoComplete="off"
                  className={`${cell} ${f.mono ? "ref" : ""}`}
                />
                {f.comboKey ? (
                  <datalist id={`${f.key}-combo`}>
                    {(comboOptions[f.comboKey] ?? []).map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            ))}
          </div>

          {block.title === "Inverter" ? (
            <div className="mt-3.5 flex flex-wrap gap-6">
              <div>
                <div className={labelCls}>Phase</div>
                <div className="inline-flex rounded-lg bg-[var(--surface-sunken)] p-[3px]">
                  {(["SINGLE", "THREE"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={v.inverterPhase === p}
                      onClick={() => set({ inverterPhase: p })}
                      className={`h-9 cursor-pointer rounded-md px-4 text-[13px] ${
                        v.inverterPhase === p
                          ? "bg-[var(--orange)] font-bold text-[var(--orange-ink)]"
                          : "font-semibold text-[var(--muted)]"
                      }`}
                    >
                      {p === "SINGLE" ? "Single phase" : "Three phase"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className={labelCls}>Hybrid system?</div>
                <div className="inline-flex rounded-lg bg-[var(--surface-sunken)] p-[3px]">
                  {[true, false].map((b) => (
                    <button
                      key={String(b)}
                      type="button"
                      aria-pressed={v.isHybrid === b}
                      onClick={() => set({ isHybrid: b })}
                      className={`h-9 cursor-pointer rounded-md px-4 text-[13px] ${
                        v.isHybrid === b
                          ? "bg-[var(--orange)] font-bold text-[var(--orange-ink)]"
                          : "font-semibold text-[var(--muted)]"
                      }`}
                    >
                      {b ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
                {v.isHybrid ? (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--orange-text)]">
                    Battery details are asked for below.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ))}

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await saveInstallation(projectId, v);
          setPending(false);
          if (!result.ok) return setError(result.error);
          setSaved(true);
          router.refresh();
        }}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save installation"}
      </button>
    </div>
  );
}
