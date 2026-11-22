import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, costRates, estimates, projects } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import {
  DEFAULT_INPUTS,
  SYSTEM_TYPES,
  type EstimateInputs,
} from "./engine";

/** Server-side reads for the estimator. Every one asserts `money.read`. */

export async function loadRatesMap(): Promise<Record<string, number>> {
  const rows = await db.select({ code: costRates.code, rate: costRates.rate }).from(costRates);
  return Object.fromEntries(rows.map((r) => [r.code, Number(r.rate) || 0]));
}

/** A stored rate snapshot, or null when there is none worth using. */
export function readRates(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (/^[A-Z_0-9]{1,40}$/.test(k) && Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

export async function listEstimates() {
  const actor = await getActor();
  assertCan(actor, "money.read");
  return db
    .select({
      id: estimates.id,
      number: estimates.number,
      name: estimates.name,
      phone: estimates.phone,
      systemType: estimates.systemType,
      capacityKw: estimates.capacityKw,
      cost: estimates.cost,
      quoteWithGst: estimates.quoteWithGst,
      customerPays: estimates.customerPays,
      projectId: estimates.projectId,
      projectCode: projects.code,
      updatedAt: estimates.updatedAt,
    })
    .from(estimates)
    .leftJoin(projects, eq(projects.id, estimates.projectId))
    .where(isNull(estimates.deletedAt))
    .orderBy(desc(estimates.updatedAt));
}

export async function loadEstimate(id: string) {
  const actor = await getActor();
  assertCan(actor, "money.read");
  const [row] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, id), isNull(estimates.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function loadProjectOptions() {
  const rows = await db
    .select({ id: projects.id, code: projects.code, firstName: contacts.firstName, lastName: contacts.lastName, phone: contacts.phone })
    .from(projects)
    .innerJoin(contacts, eq(contacts.id, projects.contactId))
    .orderBy(desc(projects.code));
  return rows.map((p) => ({
    id: p.id,
    label: `${p.code} · ${[p.firstName, p.lastName].filter(Boolean).join(" ")}`,
    name: [p.firstName, p.lastName].filter(Boolean).join(" "),
    phone: p.phone,
  }));
}

/**
 * Inputs from a browser or an old row, made safe to calculate with: every
 * number finite and in range, every choice one of its options, lists short.
 */
export function sanitizeInputs(raw: unknown): EstimateInputs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (key: keyof EstimateInputs, min: number, max: number) => {
    const v = Number(r[key]);
    return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : (DEFAULT_INPUTS[key] as number);
  };
  const overrides: EstimateInputs["overrides"] = {};
  if (r.overrides && typeof r.overrides === "object") {
    for (const [code, o] of Object.entries(r.overrides as Record<string, unknown>).slice(0, 40)) {
      if (!/^[A-Z_0-9]{1,40}$/.test(code) || !o || typeof o !== "object") continue;
      const oo = o as Record<string, unknown>;
      const q = Number(oo.quantity);
      const rt = Number(oo.rate);
      overrides[code] = {
        ...(oo.quantity !== undefined && oo.quantity !== "" && Number.isFinite(q) && q >= 0 ? { quantity: q } : {}),
        ...(oo.rate !== undefined && oo.rate !== "" && Number.isFinite(rt) && rt >= 0 ? { rate: rt } : {}),
        ...(typeof oo.label === "string" && oo.label.trim() ? { label: oo.label.trim().slice(0, 80) } : {}),
      };
    }
  }
  const extras = Array.isArray(r.extras)
    ? (r.extras as unknown[]).slice(0, 30).map((e) => {
        const ee = (e ?? {}) as Record<string, unknown>;
        return {
          label: String(ee.label ?? "").trim().slice(0, 80),
          quantity: Math.max(Number(ee.quantity) || 0, 0),
          unit: String(ee.unit ?? "piece").trim().slice(0, 16) || "piece",
          rate: Math.max(Number(ee.rate) || 0, 0),
        };
      })
    : [];
  const panelCount = Number(r.panelCount);

  return {
    systemType: (SYSTEM_TYPES as readonly string[]).includes(String(r.systemType))
      ? (r.systemType as EstimateInputs["systemType"])
      : "ON_GRID",
    segment: r.segment === "COMMERCIAL" ? "COMMERCIAL" : "RESIDENTIAL",
    optSubsidy: r.optSubsidy !== false,
    capacityKw: n("capacityKw", 0.5, 500),
    phase: r.phase === "THREE" ? "THREE" : "SINGLE",
    panelWp: n("panelWp", 100, 800),
    panelCount: Number.isFinite(panelCount) && panelCount > 0 ? Math.min(Math.round(panelCount), 2000) : null,
    dcr: r.dcr !== false,
    chemistry: r.chemistry === "LEAD_ACID" ? "LEAD_ACID" : "LITHIUM",
    loadMode: r.loadMode === "SIMPLE" ? "SIMPLE" : "APPLIANCES",
    backupLoadKw: n("backupLoadKw", 0, 100),
    backupHours: n("backupHours", 0, 48),
    appliances: Array.isArray(r.appliances)
      ? (r.appliances as unknown[]).slice(0, 40).map((a) => {
          const aa = (a ?? {}) as Record<string, unknown>;
          const num = (v: unknown, min: number, max: number, d: number) => {
            const x = Number(v);
            return Number.isFinite(x) ? Math.min(Math.max(x, min), max) : d;
          };
          return {
            name: String(aa.name ?? "").trim().slice(0, 60) || "Appliance",
            watts: num(aa.watts, 0, 20000, 0),
            qty: Math.round(num(aa.qty, 0, 100, 1)),
            hours: num(aa.hours, 0, 48, 4),
            duty: num(aa.duty, 0.05, 1, 1),
          };
        })
      : DEFAULT_INPUTS.appliances,
    leadAcidAh: [150, 200].includes(Number(r.leadAcidAh)) ? Number(r.leadAcidAh) : 150,
    lithiumAh: [100, 150, 200].includes(Number(r.lithiumAh)) ? Number(r.lithiumAh) : 100,
    acCable: r.acCable === "FLEX" || r.acCable === "ARMOURED" ? r.acCable : "AUTO",
    roofToInverterM: n("roofToInverterM", 0, 500),
    inverterToMeterM: n("inverterToMeterM", 0, 500),
    earthingRunM: n("earthingRunM", 0, 500),
    laRunM: n("laRunM", 0, 500),
    marginPct: n("marginPct", 0, 200),
    gstPct: n("gstPct", 0, 28),
    tariff: n("tariff", 0, 50),
    yieldPerKwDay: n("yieldPerKwDay", 1, 8),
    overrides,
    removed: Array.isArray(r.removed)
      ? (r.removed as unknown[]).map(String).filter((c) => /^[A-Z_0-9]{1,40}$/.test(c)).slice(0, 40)
      : [],
    extras,
  };
}
