"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { saveInstallation, type InstallationInput } from "@/app/actions/installation";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

type Key = keyof InstallationInput;

const BLOCKS: Array<{
  id: "panels" | "inverter" | "boxes";
  fields: Array<{
    key: Key;
    label: string;
    placeholder?: string;
    mono?: boolean;
    comboKey?: string;
    /**
     * Pre-filled into an empty field instead of sitting behind it as grey
     * placeholder text. Only for the distribution boxes, where the same four
     * answers were being retyped on every job and a greyed-out suggestion was
     * being read as if it had been entered. Still editable.
     */
    defaultValue?: string;
  }>;
}> = [
  {
    id: "panels",
    fields: [
      { key: "panelCompany", label: "Panel company", placeholder: "Waaree Energies Limited", comboKey: "panelCompanies" },
      { key: "panelModelNo", label: "Panel model number", placeholder: "BiN-08-535", mono: true, comboKey: "panelModels" },
      { key: "panelWattPeak", label: "Watt peak each", placeholder: "535", mono: true },
      { key: "totalPanels", label: "Total panels", placeholder: "9", mono: true },
      { key: "totalCapacityKw", label: "Total capacity (kW)", placeholder: "4.82", mono: true },
    ],
  },
  {
    id: "inverter",
    fields: [
      { key: "inverterManufacturer", label: "Manufacturer", placeholder: "Polycab", comboKey: "inverterManufacturers" },
      { key: "inverterModelNo", label: "Model number", placeholder: "PSIS-5K0", mono: true, comboKey: "inverterModels" },
      { key: "inverterSerial", label: "Serial number", placeholder: "5K0110826-2626-404353P", mono: true },
      { key: "inverterCapacityKw", label: "AC capacity (kW)", placeholder: "5", mono: true },
      { key: "inverterCount", label: "Number of inverters", placeholder: "1", mono: true },
    ],
  },
  {
    id: "boxes",
    fields: [
      { key: "acdbMake", label: "ACDB make", defaultValue: "Havells" },
      { key: "acdbSizeType", label: "ACDB size & type", defaultValue: "5 kW moisture proof" },
      { key: "acdbSpd", label: "AC surge protection", defaultValue: "Single SPD" },
      { key: "acdbMcb", label: "MCB / isolator", defaultValue: "Isolators 1" },
      { key: "dcdbMake", label: "DCDB make", defaultValue: "Havells" },
      { key: "dcdbSizeType", label: "DCDB size & type", defaultValue: "5 kW moisture proof" },
      { key: "dcdbSpd", label: "DC surge protection", defaultValue: "Single SPD" },
      { key: "dcdbMcb", label: "MCB / isolator", defaultValue: "Isolators 1" },
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
  const t = useTranslations("installation.form");
  const router = useRouter();
  // Fields carrying a default start filled, so what is on screen is what gets
  // saved. A field that already has something recorded is never overwritten.
  const [v, setV] = useState<InstallationInput>(() => {
    const seeded = { ...initial };
    for (const block of BLOCKS) {
      for (const f of block.fields) {
        if (!f.defaultValue) continue;
        if (String(seeded[f.key] ?? "").trim() === "") {
          (seeded as Record<string, unknown>)[f.key] = f.defaultValue;
        }
      }
    }
    return seeded;
  });
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
          <label className={labelCls} htmlFor="installationDate">{t("installationDate")}</label>
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
        <section key={block.id} className="mb-5">
          <h3 className="mb-0.5 text-base font-bold">{t(`blocks.${block.id}.title`)}</h3>
          <p className="mb-3 text-[13px] text-[var(--muted)]">{t(`blocks.${block.id}.note`)}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            {block.fields.map((f) => (
              <div key={f.key}>
                <label className={labelCls} htmlFor={f.key}>{t.has(`fields.${f.key}`) ? t(`fields.${f.key}`) : f.label}</label>
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

          {block.id === "inverter" ? (
            <div className="mt-3.5 flex flex-wrap gap-6">
              <div>
                <div className={labelCls}>{t("phase")}</div>
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
                      {p === "SINGLE" ? t("single") : t("three")}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className={labelCls}>{t("hybrid")}</div>
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
                      {b ? t("yes") : t("no")}
                    </button>
                  ))}
                </div>
                {v.isHybrid ? (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--orange-text)]">
                    {t("batteryBelow")}
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
        {pending ? t("saving") : saved ? t("saved") : t("save")}
      </button>
    </div>
  );
}
