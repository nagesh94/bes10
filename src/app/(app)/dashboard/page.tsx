import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import {
  batteryBanks,
  installations,
  inverterModels,
  panelCompanies,
  panelModels,
  panelSerials,
  panelTypes,
} from "@/lib/db/schema";
import { BarRow, Figure, Line, ModuleArray, Panel, n, seriesColor } from "@/components/dashboard/fleet";
import { getActor } from "@/lib/session";

/**
 * The board.
 *
 * Hardware only — modules, inverters, and what is in the catalogue behind
 * them. No customer, no project, no money: this page answers "what has the
 * company put on roofs", and the moment it starts answering "whose roof" it
 * becomes a second projects list that has to be permission-checked all over
 * again. Projects live at /projects, where they can be searched.
 *
 * Every query here is an aggregate. Nothing identifying is read.
 */

export const metadata: Metadata = { title: "Dashboard" };

/** Madhya Pradesh sits at roughly 4.2 kWh per kWp per day over the year. */
const YIELD_KWH_PER_KWP_DAY = 4.2;
/** CEA's grid emission factor, tonnes of CO₂ per MWh displaced. */
const GRID_CO2_T_PER_MWH = 0.71;

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Site evidence is typed on a roof: "waree", "Waree " and "WAREE" are one make. */
const normalise = (value: string | null) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ");
};
const keyOf = (value: string | null) => normalise(value).toLowerCase();
const titleCase = (value: string) =>
  value.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export default async function DashboardPage() {
  const [actor, t] = await Promise.all([getActor(), getTranslations()]);
  if (!actor) return null;

  // A channel partner sees their own referrals and nothing else; an
  // installer's jobs are the whole app for them. The header already hides
  // this link for both, but a hidden link is not a permission.
  if (actor.role === "PARTNER") notFound();
  if (actor.role === "INSTALLER") redirect("/installer");

  const [rows, serialRow, batteryRow, catalogueRow, dcrModels] = await Promise.all([
    db
      .select({
        panelCompany: installations.panelCompany,
        panelModelNo: installations.panelModelNo,
        panelWattPeak: installations.panelWattPeak,
        totalPanels: installations.totalPanels,
        totalCapacityKw: installations.totalCapacityKw,
        inverterManufacturer: installations.inverterManufacturer,
        inverterCapacityKw: installations.inverterCapacityKw,
        inverterCount: installations.inverterCount,
        inverterPhase: installations.inverterPhase,
        isHybrid: installations.isHybrid,
      })
      .from(installations),
    db.select({ c: sql<number>`count(*)::int` }).from(panelSerials),
    db.select({ c: sql<number>`count(*)::int` }).from(batteryBanks),
    db
      .select({
        panelModels: sql<number>`(select count(*)::int from ${panelModels} where ${panelModels.active})`,
        panelMakes: sql<number>`(select count(*)::int from ${panelCompanies} where ${panelCompanies.active})`,
        panelTypes: sql<number>`(select count(*)::int from ${panelTypes} where ${panelTypes.active})`,
        inverterModels: sql<number>`(select count(*)::int from ${inverterModels} where ${inverterModels.active})`,
        inverterMakes: sql<number>`(select count(distinct ${inverterModels.manufacturer})::int from ${inverterModels} where ${inverterModels.active})`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({ modelNo: panelModels.modelNo, isDcr: panelModels.isDcr })
      .from(panelModels)
      .where(eq(panelModels.active, true)),
  ]);

  const serialsRecorded = serialRow[0]?.c ?? 0;
  const batteryBanksCount = batteryRow[0]?.c ?? 0;
  const catalogue = catalogueRow[0];

  // ── Modules ────────────────────────────────────────────────────────────
  const modules = rows.reduce((sum, r) => sum + num(r.totalPanels), 0);
  const dcKw = rows.reduce((sum, r) => {
    const stated = num(r.totalCapacityKw);
    if (stated > 0) return sum + stated;
    return sum + (num(r.totalPanels) * num(r.panelWattPeak)) / 1000;
  }, 0);
  const wattSum = rows.reduce((sum, r) => sum + num(r.totalPanels) * num(r.panelWattPeak), 0);
  const avgWp = modules > 0 ? wattSum / modules : 0;
  const peakWp = rows.reduce((max, r) => Math.max(max, num(r.panelWattPeak)), 0);

  const dcrByModel = new Map(dcrModels.map((m) => [m.modelNo.trim().toLowerCase(), m.isDcr]));
  let dcrModules = 0;
  let unmatchedModules = 0;
  for (const r of rows) {
    const hit = dcrByModel.get((r.panelModelNo ?? "").trim().toLowerCase());
    if (hit === undefined) unmatchedModules += num(r.totalPanels);
    else if (hit) dcrModules += num(r.totalPanels);
  }

  const byMake = group(rows, (r) => r.panelCompany, (r) => num(r.totalPanels), (r) =>
    num(r.totalCapacityKw) || (num(r.totalPanels) * num(r.panelWattPeak)) / 1000,
  );

  const byRating = group(
    rows.filter((r) => num(r.panelWattPeak) > 0),
    (r) => String(num(r.panelWattPeak)),
    (r) => num(r.totalPanels),
    (r) => (num(r.totalPanels) * num(r.panelWattPeak)) / 1000,
  ).sort((a, b) => Number(b.label) - Number(a.label));

  // ── Inverters ──────────────────────────────────────────────────────────
  const units = (r: (typeof rows)[number]) => Math.max(num(r.inverterCount), r.inverterManufacturer ? 1 : 0);
  const inverterUnits = rows.reduce((sum, r) => sum + units(r), 0);
  const acKw = rows.reduce((sum, r) => sum + num(r.inverterCapacityKw) * Math.max(num(r.inverterCount), 1), 0);
  const byInverter = group(rows, (r) => r.inverterManufacturer, units, (r) =>
    num(r.inverterCapacityKw) * Math.max(num(r.inverterCount), 1),
  );

  const singlePhase = rows.filter((r) => r.inverterPhase === "SINGLE").reduce((s, r) => s + units(r), 0);
  const threePhase = rows.filter((r) => r.inverterPhase === "THREE").reduce((s, r) => s + units(r), 0);
  const hybrid = rows.filter((r) => r.isHybrid).length;

  const dailyKwh = dcKw * YIELD_KWH_PER_KWP_DAY;
  const annualMwh = (dailyKwh * 365) / 1000;
  const ratio = acKw > 0 ? dcKw / acKw : 0;

  const heading = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h1 className="text-[27px] font-extrabold">{t("nav.dashboard")}</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--muted)]">
          Panels and inverters across every commissioned array.
        </p>
      </div>
      <p className="text-[13px] text-[var(--muted-soft)]">
        {rows.length === 1 ? "1 array" : `${n(rows.length)} arrays`} on record
      </p>
    </div>
  );

  if (modules === 0 && inverterUnits === 0) {
    return (
      <main className="mx-auto max-w-[1180px] px-4 pt-6 pb-16 md:px-6">
        {heading}
        <Panel raised>
          <div className="px-6 py-16 text-center">
            <p className="text-[17px] font-bold">No hardware recorded yet</p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-relaxed text-[var(--muted)]">
              Modules and inverters appear here as soon as a crew completes the site evidence
              form at stage 3 of a project.
            </p>
            <Link
              href="/projects"
              className="mt-6 inline-flex h-11 items-center rounded-[var(--radius-control)] bg-[var(--orange)] px-5 text-[14px] font-bold text-[var(--orange-ink)] no-underline"
            >
              Open projects
            </Link>
          </div>
        </Panel>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 pt-6 pb-16 md:px-6">
      {heading}

      {/* The array itself, at the top, because it is the work. */}
      <Panel raised className="mb-4 overflow-hidden">
        <div className="grid gap-7 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10 lg:px-7">
          <div>
            <Figure
              size="lg"
              tone="gold"
              value={n(dcKw, 2)}
              unit="kWp"
              label={`${n(modules)} modules installed, direct current rating`}
            />

            <div className="mt-7">
              <ModuleArray
                groups={byMake.map((g) => ({ label: g.label, modules: g.value }))}
                total={modules}
              />
            </div>

            <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {byMake.map((g, i) => (
                <li key={g.key} className="flex items-baseline gap-2.5">
                  <span
                    aria-hidden
                    className="mt-[1px] block h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: seriesColor(i) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {g.label}
                  </span>
                  <span className="num shrink-0 text-[13.5px] font-bold">{n(g.value)}</span>
                  <span className="num w-20 shrink-0 text-right text-[12.5px] text-[var(--muted)]">
                    {n(g.weight, 2)} kWp
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The rest of the fleet's headline figures, ruled rather than
              boxed: four cards here would turn the page into a card grid. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 self-start border-[var(--line-soft)] lg:grid-cols-1 lg:gap-y-5 lg:border-l lg:pl-8">
            <div>
              <Figure value={n(acKw, 2)} unit="kW" label="Inverter capacity, alternating current" />
            </div>
            <div>
              <Figure value={ratio > 0 ? ratio.toFixed(2) : "—"} label="DC to AC ratio" />
            </div>
            <div>
              <Figure value={n(dailyKwh)} unit="kWh" label="Estimated generation per day" />
            </div>
            <div>
              <Figure
                value={n(annualMwh * GRID_CO2_T_PER_MWH)}
                unit="t"
                label="Estimated CO₂ avoided per year"
              />
            </div>
          </dl>
        </div>
      </Panel>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Panel title="Modules" note={`${byMake.length} ${byMake.length === 1 ? "make" : "makes"} in service`}>
          <Line label="Average rating" value={`${n(avgWp)} Wp`} />
          <Line label="Highest rating fitted" value={`${n(peakWp)} Wp`} />
          <Line
            label="Serial numbers recorded"
            value={`${n(serialsRecorded)} of ${n(modules)}`}
            hint={modules > 0 ? `${Math.round((serialsRecorded / modules) * 100)}%` : undefined}
          />
          <Line
            label="DCR modules, subsidy eligible"
            value={`${n(dcrModules)} of ${n(modules)}`}
            hint={unmatchedModules > 0 ? `${n(unmatchedModules)} unmatched` : undefined}
          />
        </Panel>

        <Panel title="Inverters" note={`${n(inverterUnits)} ${inverterUnits === 1 ? "unit" : "units"}`}>
          <Line label="Single phase" value={n(singlePhase)} />
          <Line label="Three phase" value={n(threePhase)} />
          <Line label="Hybrid systems" value={n(hybrid)} />
          <Line label="Battery banks commissioned" value={n(batteryBanksCount)} />
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Panel title="Modules by rating" note="Watt peak per module">
          <ul>
            {byRating.map((g, i) => (
              <BarRow
                key={g.key}
                label={`${g.label} Wp`}
                share={modules > 0 ? g.value / modules : 0}
                color={seriesColor(i)}
                primary={n(g.value)}
                secondary={`${n(g.weight, 2)} kWp`}
              />
            ))}
          </ul>
        </Panel>

        <Panel title="Inverters by manufacturer" note="Units and rated output">
          <ul>
            {byInverter.map((g, i) => (
              <BarRow
                key={g.key}
                label={g.label}
                share={inverterUnits > 0 ? g.value / inverterUnits : 0}
                color={seriesColor(i)}
                primary={n(g.value)}
                secondary={`${n(g.weight, 2)} kW`}
              />
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Catalogue" note="What a quotation can be built from today">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Panel models", value: catalogue?.panelModels ?? 0 },
            { label: "Panel makes", value: catalogue?.panelMakes ?? 0 },
            { label: "Panel types", value: catalogue?.panelTypes ?? 0 },
            { label: "Inverter models", value: catalogue?.inverterModels ?? 0 },
            { label: "Inverter makes", value: catalogue?.inverterMakes ?? 0 },
          ].map((c) => (
            <div
              key={c.label}
              className="border-b border-[var(--line-soft)] px-5 py-4 last:border-r-0 sm:border-r sm:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(3n)]:border-r lg:[&:nth-child(5n)]:border-r-0"
            >
              <div className="num text-[24px] font-extrabold">{n(c.value)}</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--muted)]">{c.label}</div>
            </div>
          ))}
        </div>
      </Panel>
    </main>
  );
}

/** Sums `value` and `weight` per key, biggest first, with blanks last. */
function group<T>(
  rows: T[],
  label: (row: T) => string | null,
  value: (row: T) => number,
  weight: (row: T) => number,
) {
  const out = new Map<string, { key: string; label: string; value: number; weight: number }>();
  for (const row of rows) {
    const raw = normalise(label(row));
    const v = value(row);
    if (v <= 0) continue;
    const key = keyOf(label(row)) || "—";
    const entry = out.get(key) ?? {
      key,
      label: raw ? titleCase(raw) : "Not recorded",
      value: 0,
      weight: 0,
    };
    entry.value += v;
    entry.weight += weight(row);
    out.set(key, entry);
  }
  return [...out.values()].sort((a, b) => b.value - a.value);
}
