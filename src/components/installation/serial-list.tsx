"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { lookupPanelSerials } from "@/app/actions/dcr";
import { saveBatteryBank, savePanelSerials } from "@/app/actions/installation";
import { normaliseSerial } from "@/lib/dcr/fields";
import type { SerialCheck } from "@/lib/dcr/matching";
import { useConfirm } from "@/components/shell/confirm";

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
  checkDcr = false,
  wattPeak = null,
}: {
  projectId: string;
  initial: string[];
  expected: number;
  /** A DCR project: look every serial up against the stored certificates. */
  checkDcr?: boolean;
  /** The module rating recorded on stage 3, to catch a serial from another model. */
  wattPeak?: number | null;
}) {
  const t = useTranslations("installation");
  const router = useRouter();
  const ask = useConfirm();
  const [serials, setSerials] = useState<string[]>(initial.length ? initial : [""]);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Map<string, SerialCheck>>(new Map());

  // Looked up as the list changes, half a second after the last keystroke, so
  // a serial shows whether it is on a certificate before anything is saved.
  const key = serials.map((s) => normaliseSerial(s)).filter(Boolean).join("|");
  useEffect(() => {
    if (!checkDcr || !key) {
      setChecks(new Map());
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const result = await lookupPanelSerials(projectId, key.split("|"));
        if (live) setChecks(new Map(result.map((c) => [normaliseSerial(c.serialNo), c])));
      } catch {
        // A failed lookup leaves the badges off; saving still works and re-checks.
      }
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [checkDcr, key, projectId]);

  const checked = serials.map((s) => (s.trim() ? checks.get(normaliseSerial(s)) : undefined));
  const unmatched = checked.filter((c) => c && c.status !== "matched").length;
  const matched = checked.filter((c) => c?.status === "matched").length;

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

  /**
   * A serial that has been scanned off a module is the one thing on this page
   * that cannot be retyped from memory, and × sits next to every row — so
   * taking a filled row out asks first. An untouched blank row has nothing to
   * lose and goes without a question.
   */
  async function removeAt(i: number) {
    const serial = (serials[i] ?? "").trim();
    if (serial) {
      const answer = await ask({
        title: t("serials.removeTitle", { n: i + 1 }),
        body: t.rich("serials.removeBody", {
          serial,
          ref: (chunks) => <span className="ref font-semibold text-[var(--ink)]">{chunks}</span>,
        }),
        confirmLabel: t("serials.remove"),
      });
      if (!answer.confirmed) return;
    }
    setSerials((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [""]));
    setSaved(false);
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
        <h3 className="flex-1 text-base font-bold">{t("serials.title")}</h3>
        <span
          className={`ref text-[12.5px] font-semibold ${
            expected > 0 && filled >= expected
              ? "text-[var(--green-text)]"
              : "text-[var(--amber-text)]"
          }`}
        >
          {expected > 0 ? t("serials.ofExpected", { filled, expected }) : filled}
        </span>
      </div>
      <p className="mb-3.5 text-[13px] text-[var(--muted)]">{t("serials.pasteHint")}</p>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {serials.map((s, i) => {
          const dup = s.trim() !== "" && duplicates.has(s);
          const check = checked[i];
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="ref mt-3.5 w-6 shrink-0 text-right text-[11.5px] text-[var(--muted)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
              <input
                aria-label={t("serials.serialAria", { n: i + 1 })}
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
                className={`${cell} ref ${
                  dup || check?.status === "missing"
                    ? "border-[var(--red-text)]"
                    : check?.status === "elsewhere"
                      ? "border-[var(--amber-text)]"
                      : check?.status === "matched"
                        ? "border-[var(--green-text)]"
                        : ""
                }`}
              />
              {check ? <SerialBadge check={check} wattPeak={wattPeak} /> : null}
              </div>
              <button
                type="button"
                aria-label={t("serials.removeAria", { n: i + 1 })}
                onClick={() => void removeAt(i)}
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
{t("serials.duplicate")}
        </p>
      ) : null}
      {checkDcr && matched + unmatched > 0 ? (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] ${
            unmatched > 0
              ? "bg-[var(--amber-surface)] text-[var(--amber-body)]"
              : "bg-[var(--green-soft)] text-[var(--green-text)]"
          }`}
        >
          {matched} of {matched + unmatched} serial{matched + unmatched === 1 ? "" : "s"} found on a stored DCR
          certificate.
          {unmatched > 0
            ? " You can still save — the project will be flagged for a DCR check until every serial matches."
            : ""}
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
          className="h-11 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)]"
        >
          {t("serials.add")}
        </button>
        <button
          type="button"
          disabled={pending || duplicates.size > 0}
          onClick={save}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? t("common.saving") : saved ? t("common.saved") : t("serials.save")}
        </button>
      </div>
    </div>
  );
}

/** What the DCR lookup found for one serial. */
function SerialBadge({ check, wattPeak }: { check: SerialCheck; wattPeak: number | null }) {
  if (check.status === "missing") {
    return (
      <span className="mt-1 block text-[11.5px] font-semibold text-[var(--red-text)]">
        ✗ Not on any stored DCR certificate
      </span>
    );
  }
  if (check.status === "elsewhere") {
    return (
      <span className="mt-1 block text-[11.5px] font-semibold text-[var(--amber-text)]">
        ⚠ Also recorded on {check.otherProjects.map((p) => p.label).join(", ")}
      </span>
    );
  }
  const wrongWp = wattPeak && check.wattPeak && check.wattPeak !== wattPeak;
  return (
    <span
      className={`mt-1 block text-[11.5px] font-semibold ${
        wrongWp ? "text-[var(--amber-text)]" : "text-[var(--green-text)]"
      }`}
    >
      ✓ DCR <span className="ref">{check.certificateNo}</span>
      {wrongWp ? ` · ${check.wattPeak} Wp, but this job records ${wattPeak} Wp` : ""}
    </span>
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
  const t = useTranslations("installation");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<typeof initial>) => {
    setV((o) => ({ ...o, ...patch }));
    setSaved(false);
  };

  const fields: Array<[keyof typeof initial, string, string?]> = [
    ["manufacturer", t("battery.fields.manufacturer"), "Luminous"],
    ["batteryType", t("battery.fields.batteryType"), "Lithium LFP"],
    ["cellCapacity", t("battery.fields.cellCapacity"), "100 Ah"],
    ["seriesCount", t("battery.fields.seriesCount"), "4"],
    ["parallelCount", t("battery.fields.parallelCount"), "1"],
    ["totalVoltage", t("battery.fields.totalVoltage"), "51.2 V"],
    ["totalCapacity", t("battery.fields.totalCapacity"), "5.12 kWh"],
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border-[1.5px] border-[var(--orange)]">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--orange-border)] bg-[var(--amber-surface)] px-5 py-3.5">
        <h3 className="flex-1 text-base font-bold">{t("battery.title")}</h3>
        <span className="text-[11.5px] font-bold text-[var(--orange-text)]">
          {t("battery.shownBecause")}
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

        <label className={labelCls} htmlFor="bb-serials">{t("battery.cellSerials")}</label>
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
          {pending ? t("common.saving") : saved ? t("common.saved") : t("battery.save")}
        </button>
      </div>
    </div>
  );
}
