"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveStructureMembers, type MemberInput } from "@/app/actions/installation";

type MemberType = "COLUMN" | "RAFTER" | "PURLIN";

const GROUPS: Array<{ type: MemberType; label: string; add: string; colour: string; defaultSize: string }> = [
  { type: "COLUMN", label: "Column", add: "Add a column", colour: "var(--navy)", defaultSize: "140 x 50 mm" },
  { type: "RAFTER", label: "Rafter", add: "Add a rafter", colour: "var(--link)", defaultSize: "80 x 40 mm" },
  { type: "PURLIN", label: "Purlin", add: "Add a purlin", colour: "var(--orange)", defaultSize: "40 x 40 mm" },
];

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";

/**
 * Column, rafter and purlin, each with any number of runs.
 *
 * A 3 kW roof commonly has four columns at four different lengths, so size
 * and length are captured per run rather than once per type.
 */
export function StructureMembers({
  projectId,
  initial,
  initialCompany,
  initialLegCount,
}: {
  projectId: string;
  initial: MemberInput[];
  initialCompany: string;
  initialLegCount: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<MemberInput[]>(initial);
  const [company, setCompany] = useState(initialCompany);
  const [legCount, setLegCount] = useState(initialLegCount);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (v: string) => Number(String(v).replace(/[^\d.]/g, "")) || 0;

  function update(index: number, patch: Partial<MemberInput>) {
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function save() {
    setPending(true);
    setError(null);
    const result = await saveStructureMembers(projectId, rows, {
      structureCompany: company,
      legCount,
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h3 className="flex-1 text-base font-bold">Structure</h3>
        <span className="ref text-[12.5px] text-[var(--muted)]">
          {rows.reduce((s, r) => s + (num(r.quantity) || 1), 0)} pieces ·{" "}
          {rows
            .reduce((s, r) => s + num(r.lengthM) * (num(r.quantity) || 1), 0)
            .toFixed(1)}{" "}
          ft
        </span>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
        The fabricator, leg count and every column, rafter and purlin run — each with its own size
        and length. A 3 kW roof often has four columns at four different lengths.
      </p>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--muted)]" htmlFor="structureCompany">
            Structure company
          </label>
          <input
            id="structureCompany"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setSaved(false);
            }}
            placeholder="Shakti Fabricators"
            className={cell}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--muted)]" htmlFor="legCount">
            Number of legs
          </label>
          <input
            id="legCount"
            value={legCount}
            onChange={(e) => {
              setLegCount(e.target.value);
              setSaved(false);
            }}
            inputMode="numeric"
            className={`${cell} ref`}
          />
        </div>
      </div>

      {GROUPS.map((group) => {
        const indexed = rows
          .map((r, i) => ({ row: r, i }))
          .filter(({ row }) => row.memberType === group.type);
        const pieces = indexed.reduce((s, { row }) => s + (num(row.quantity) || 1), 0);
        const metres = indexed.reduce(
          (s, { row }) => s + num(row.lengthM) * (num(row.quantity) || 1),
          0,
        );

        return (
          <div key={group.type} className="mb-5">
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <span
                className="block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: group.colour }}
              />
              <h4 className="text-[14.5px] font-bold">{group.label}</h4>
              <span className="flex-1" />
              <span className="ref text-[12px] text-[var(--muted)]">
                {pieces} {pieces === 1 ? "piece" : "pieces"} · {metres.toFixed(1)} ft
              </span>
            </div>

            <div className="overflow-x-auto rounded-[9px] border border-[var(--line)]">
              <div className="grid min-w-[330px] grid-cols-[34px_1.4fr_1fr_84px_44px] items-center gap-2.5 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                <span />
                {["Size", "Length (ft)", "Qty"].map((h) => (
                  <span
                    key={h}
                    className="text-[12px] font-semibold text-[var(--muted)]"
                  >
                    {h}
                  </span>
                ))}
                <span />
              </div>

              {indexed.length === 0 ? (
                <p className="px-3 py-4 text-center text-[12.5px] text-[var(--muted)]">
                  No {group.label.toLowerCase()} runs yet.
                </p>
              ) : (
                indexed.map(({ row, i }, n) => (
                  <div
                    key={i}
                    className="grid min-w-[330px] grid-cols-[34px_1.4fr_1fr_84px_44px] items-center gap-2.5 border-b border-[var(--line-soft)] px-3 py-2.5"
                  >
                    <span className="ref flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--chip-soft)] text-[11.5px] font-bold text-[var(--chip-text)]">
                      {n + 1}
                    </span>
                    <input
                      aria-label={`${group.label} ${n + 1} size`}
                      value={row.size}
                      onChange={(e) => update(i, { size: e.target.value })}
                      placeholder={group.defaultSize}
                      className={`${cell} ref`}
                    />
                    <input
                      aria-label={`${group.label} ${n + 1} length in feet`}
                      value={row.lengthM}
                      onChange={(e) => update(i, { lengthM: e.target.value.replace(/[^0-9.]/g, "") })}
                      placeholder="8"
                      inputMode="decimal"
                      className={`${cell} ref`}
                    />
                    <input
                      aria-label={`${group.label} ${n + 1} quantity`}
                      value={row.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value.replace(/[^0-9]/g, "") })}
                      inputMode="numeric"
                      className={`${cell} ref text-center`}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${group.label.toLowerCase()} ${n + 1}`}
                      onClick={() => {
                        setRows((list) => list.filter((_, j) => j !== i));
                        setSaved(false);
                      }}
                      className="h-10 w-10 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--red-text)]"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setRows((list) => [
                  ...list,
                  { memberType: group.type, size: group.defaultSize, lengthM: "", quantity: "1" },
                ]);
                setSaved(false);
              }}
              className="mt-2 h-10 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--navy)]"
            >
              + {group.add}
            </button>
          </div>
        );
      })}

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save structure"}
      </button>
    </div>
  );
}
