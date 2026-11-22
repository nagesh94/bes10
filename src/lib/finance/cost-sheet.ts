import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  costRates,
  installations,
  materialConsumption,
  projectCostLines,
  quotations,
} from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * A project's cost calculator: the dealer-bought material, line by line.
 *
 * Until someone saves the sheet, every line is proposed from what is already
 * on file — the panels, inverter, cable lengths and pipe count recorded at
 * installation — priced from the master rate card. Once saved, the project
 * keeps its own lines, quantities and rates; the proposal is still worked out
 * so the page can say when installation has since recorded something else.
 */

export interface CostLine {
  code: string;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  /** Where the quantity came from, e.g. "42 m · 6 sqmm · Polycab". */
  source?: string | null;
  /** How the dealer was paid; null until someone says. */
  paymentMode?: string | null;
  /** For "Other": how, in words. */
  paymentNote?: string | null;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

const WIRE_CODES = {
  DC: "WIRE_DC",
  AC: "WIRE_AC",
  LA: "WIRE_LA",
  EARTHING: "WIRE_EARTHING",
} as const;

/**
 * The rate-card code for an item of a given size: 3 kW → "INVERTER_3KW",
 * 3.5 kW → "INVERTER_3_5KW". Null when the size is unknown.
 */
export function sizedCode(base: string, kw: number): string | null {
  if (!kw || !Number.isFinite(kw)) return null;
  return `${base}_${String(round2(kw)).replace(".", "_")}KW`;
}

export async function loadCostRates() {
  return db.select().from(costRates).orderBy(asc(costRates.sortOrder), asc(costRates.code));
}

/** The lines installation data and the rate card suggest for one project. */
async function proposeLines(projectId: string): Promise<{ lines: CostLine[]; systemKw: number; installed: boolean }> {
  const [rates, [inst], cables, [quote]] = await Promise.all([
    loadCostRates(),
    db.select().from(installations).where(eq(installations.projectId, projectId)).limit(1),
    db
      .select()
      .from(materialConsumption)
      .where(eq(materialConsumption.projectId, projectId))
      .orderBy(asc(materialConsumption.sortOrder)),
    db
      .select({ capacityKwp: quotations.capacityKwp })
      .from(quotations)
      .where(and(eq(quotations.projectId, projectId), eq(quotations.isChosen, true), isNull(quotations.deletedAt)))
      .limit(1),
  ]);

  const rateOf = new Map(rates.map((r) => [r.code, r]));
  const line = (code: string, quantity: number, source: string | null, label?: string): CostLine => {
    const r = rateOf.get(code);
    const rate = num(r?.rate);
    const qty = round2(quantity);
    return {
      code,
      label: label ?? r?.label ?? code,
      quantity: qty,
      unit: r?.unit ?? "piece",
      rate,
      amount: round2(qty * rate),
      source,
    };
  };

  const panels = num(inst?.totalPanels);
  const wp = num(inst?.panelWattPeak);
  const installedKw =
    num(inst?.totalCapacityKw) || (panels && wp ? (panels * wp) / 1000 : 0);
  // Before installation, the chosen quotation's size is the best guess.
  const systemKw = installedKw || num(quote?.capacityKwp);
  const kwSource = installedKw
    ? "installed capacity"
    : systemKw
      ? "quoted capacity — not installed yet"
      : "no capacity on file yet";

  const lines: CostLine[] = [];

  lines.push(
    line(
      "PANEL",
      panels && wp ? panels * wp : systemKw * 1000,
      panels && wp
        ? `${panels} × ${wp} W${inst?.panelCompany ? ` · ${inst.panelCompany}` : ""}`
        : kwSource,
    ),
  );

  // Inverter and structure are bought as one unit, priced by size: the
  // rate card's "3 kW" line for a 3 kW job, the unsized fallback otherwise.
  const sized = (base: "INVERTER" | "STRUCTURE", kw: number) => {
    const code = sizedCode(base, kw);
    return code && rateOf.has(code) ? code : base;
  };
  const noRate = (code: string, kw: number) =>
    num(rateOf.get(code)?.rate) === 0 && kw ? ` · no ${kw} kW price on the rate card yet` : "";

  const invUnitKw = num(inst?.inverterCapacityKw) || systemKw;
  const invCode = sized("INVERTER", invUnitKw);
  lines.push(
    line(
      invCode,
      num(inst?.inverterCount) || 1,
      `${invUnitKw ? `${invUnitKw} kW` : "size not known"}${
        inst?.inverterManufacturer ? ` · ${inst.inverterManufacturer}` : ""
      }${inst?.inverterModelNo ? ` ${inst.inverterModelNo}` : ""}${noRate(invCode, invUnitKw)}`,
    ),
  );

  const structCode = sized("STRUCTURE", systemKw);
  lines.push(
    line(
      structCode,
      1,
      `${systemKw ? `${systemKw} kW` : "size not known"}${inst?.structureCompany ? ` · ${inst.structureCompany}` : ""}${
        inst?.legCount ? ` · ${inst.legCount} legs` : ""
      }${noRate(structCode, systemKw)}`,
    ),
  );

  lines.push(line("DCDB", 1, inst?.dcdbMake ? `${inst.dcdbMake}${inst.dcdbSizeType ? ` · ${inst.dcdbSizeType}` : ""}` : null));
  lines.push(line("ACDB", 1, inst?.acdbMake ? `${inst.acdbMake}${inst.acdbSizeType ? ` · ${inst.acdbSizeType}` : ""}` : null));

  // Cable: one line per kind, summed across runs, with the sizes named.
  for (const kind of ["DC", "AC", "LA", "EARTHING"] as const) {
    const runs = cables.filter((c) => c.category === kind);
    const metres = runs.reduce((s, c) => s + num(c.lengthM), 0);
    const detail = [...new Set(runs.map((c) => [c.sizeSqmm ? `${c.sizeSqmm} sqmm` : null, c.make].filter(Boolean).join(" ")))]
      .filter(Boolean)
      .join(", ");
    lines.push(
      line(
        WIRE_CODES[kind],
        metres,
        metres ? `${round2(metres)} m from installation${detail ? ` · ${detail}` : ""}` : "not recorded at installation yet",
      ),
    );
  }

  const pipes = num(inst?.pipesUsed);
  lines.push(line("PIPE", pipes, pipes ? `${pipes} pipes from installation` : "not recorded at installation yet"));

  // One kit, lightning arrester included.
  lines.push(line("EARTHING", 1, "includes the lightning arrester"));

  return { lines, systemKw, installed: Boolean(inst) };
}

/** Everything the calculator page needs for one project. Admin-only. */
export async function loadCostSheet(projectId: string) {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const [proposal, saved] = await Promise.all([
    proposeLines(projectId),
    db
      .select()
      .from(projectCostLines)
      .where(eq(projectCostLines.projectId, projectId))
      .orderBy(asc(projectCostLines.sortOrder)),
  ]);

  const proposedByCode = new Map(proposal.lines.map((l) => [l.code, l]));
  const savedLines: CostLine[] = saved.map((l) => ({
    code: l.code,
    label: l.label,
    quantity: num(l.quantity),
    unit: l.unit,
    rate: num(l.rate),
    amount: num(l.amount),
    paymentMode: l.paymentMode,
    paymentNote: l.paymentNote,
    // The saved sheet still shows where its numbers could come from.
    source: proposedByCode.get(l.code)?.source ?? null,
  }));

  return {
    saved: saved.length > 0,
    savedAt: saved.reduce<Date | null>((d, l) => (!d || l.updatedAt > d ? l.updatedAt : d), null),
    lines: saved.length ? savedLines : proposal.lines,
    proposed: proposal.lines,
    systemKw: proposal.systemKw,
    installed: proposal.installed,
  };
}

/**
 * Saved cost-sheet totals for every project, for the dashboard's margins.
 * A project whose sheet was never saved is simply absent.
 */
export async function loadCostSheetTotals(): Promise<Map<string, number>> {
  const actor = await getActor();
  assertCan(actor, "money.read");
  const rows = await db
    .select({ projectId: projectCostLines.projectId, amount: projectCostLines.amount })
    .from(projectCostLines);
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.projectId, (by.get(r.projectId) ?? 0) + num(r.amount));
  return by;
}
