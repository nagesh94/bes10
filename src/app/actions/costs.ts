"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { costRates, projectCostLines, projects } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { isCostPaymentMode } from "@/lib/finance/cost-payment";
import { sizedCode } from "@/lib/finance/cost-sheet";

export type CostResult = { ok: true } | { ok: false; error: string };

export interface CostLineInput {
  code: string;
  label: string;
  quantity: string | number;
  unit: string;
  rate: string | number;
  /** CASH, UPI, NET_BANKING, OTHER — or blank when not known yet. */
  paymentMode?: string | null;
  paymentNote?: string | null;
}

const num = (v: string | number) => {
  const n = Number(String(v).replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Saves a project's cost sheet, replacing what was there.
 *
 * The amount is worked out here from quantity × rate rather than trusted
 * from the browser, so a sheet can never total something its own lines do
 * not add up to.
 */
export async function saveCostSheet(projectId: string, input: CostLineInput[]): Promise<CostResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };
  if (input.length > 60) return { ok: false, error: "That is more lines than a cost sheet should have." };

  const lines: (typeof projectCostLines.$inferInsert)[] = [];
  for (const [i, l] of input.entries()) {
    const label = String(l.label ?? "").trim().slice(0, 120);
    const quantity = num(l.quantity);
    const rate = num(l.rate);
    // A blank added line is someone who changed their mind, not an error.
    if (!label && !quantity && !rate) continue;
    if (!label) return { ok: false, error: `Line ${i + 1} needs a name.` };
    if (Number.isNaN(quantity) || quantity < 0) return { ok: false, error: `Check the quantity for ${label}.` };
    if (Number.isNaN(rate) || rate < 0) return { ok: false, error: `Check the rate for ${label}.` };
    const paymentMode = l.paymentMode && isCostPaymentMode(l.paymentMode) ? l.paymentMode : null;
    const paymentNote = paymentMode === "OTHER" ? String(l.paymentNote ?? "").trim().slice(0, 120) || null : null;
    if (paymentMode === "OTHER" && !paymentNote) {
      return { ok: false, error: `Say how ${label} was paid, since it is marked Other.` };
    }
    lines.push({
      paymentMode,
      paymentNote,
      projectId,
      code: String(l.code || "CUSTOM").slice(0, 40),
      label,
      quantity: round2(quantity).toFixed(2),
      unit: String(l.unit || "piece").trim().slice(0, 20) || "piece",
      rate: round2(rate).toFixed(2),
      amount: round2(quantity * rate).toFixed(2),
      sortOrder: i,
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(projectCostLines).where(eq(projectCostLines.projectId, projectId));
    if (lines.length) await tx.insert(projectCostLines).values(lines);
  });

  const total = lines.reduce((s, l) => s + Number(l.amount), 0);
  await writeAudit({
    actorId: actor.id,
    action: "cost.sheet.save",
    entityType: "cost_sheet",
    entityId: projectId,
    projectId,
    after: { lines: lines.length, total },
  });

  revalidatePath(`/projects/${projectId}/costs`);
  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath("/finance", "layout");
  return { ok: true };
}

/** Forget the saved sheet, so the calculator proposes fresh lines again. */
export async function resetCostSheet(projectId: string): Promise<CostResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");
  await db.delete(projectCostLines).where(eq(projectCostLines.projectId, projectId));
  await writeAudit({
    actorId: actor.id,
    action: "cost.sheet.reset",
    entityType: "cost_sheet",
    entityId: projectId,
    projectId,
  });
  revalidatePath(`/projects/${projectId}/costs`);
  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath("/finance", "layout");
  return { ok: true };
}

const SIZED_ITEMS = {
  INVERTER: { label: "Inverter", unit: "piece", sort: 20 },
  INVERTER_HYBRID: { label: "Hybrid inverter", unit: "piece", sort: 43 },
  INVERTER_OFF_GRID: { label: "Off-grid PCU", unit: "piece", sort: 46 },
  STRUCTURE: { label: "Mounting structure", unit: "unit", sort: 30 },
} as const;

/**
 * A price for one more size of inverter or structure — "Inverter 4 kW".
 * The calculator picks it up for any job of exactly that size.
 */
export async function addSizedRate(
  base: string,
  kwRaw: string,
  rateRaw: string,
): Promise<CostResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");

  if (!(base in SIZED_ITEMS)) return { ok: false, error: "Choose inverter or structure." };
  const item = SIZED_ITEMS[base as keyof typeof SIZED_ITEMS];
  const kw = num(kwRaw);
  if (Number.isNaN(kw) || kw <= 0 || kw > 500) return { ok: false, error: "Enter the size in kW." };
  const rate = num(rateRaw);
  if (Number.isNaN(rate) || rate < 0 || rate > 1e8) return { ok: false, error: "Enter the price in rupees." };

  const code = sizedCode(base, kw)!;
  const [existing] = await db.select({ id: costRates.id }).from(costRates).where(eq(costRates.code, code)).limit(1);
  if (existing) return { ok: false, error: `${item.label} ${round2(kw)} kW is already on the card — edit its rate.` };

  await db.insert(costRates).values({
    code,
    label: `${item.label} ${round2(kw)} kW`,
    unit: item.unit,
    rate: round2(rate).toFixed(2),
    // Sizes sit in order under their item, before the "other sizes" line.
    sortOrder: item.sort + Math.min(Math.round(kw), 8),
  });
  await writeAudit({
    actorId: actor.id,
    action: "cost.rate.save",
    entityType: "cost_rate",
    entityId: code,
    after: { code, rate: round2(rate) },
  });
  revalidatePath("/admin/master");
  return { ok: true };
}

/** One rate on the master rate card. Saved sheets keep their own copy. */
export async function saveCostRate(id: number, rateRaw: string): Promise<CostResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");

  const rate = num(rateRaw);
  if (Number.isNaN(rate) || rate < 0 || rate > 1e8) return { ok: false, error: "Enter a rate in rupees." };

  const [before] = await db.select().from(costRates).where(eq(costRates.id, id)).limit(1);
  if (!before) return { ok: false, error: "That rate no longer exists." };

  await db
    .update(costRates)
    .set({ rate: round2(rate).toFixed(2), updatedAt: new Date() })
    .where(eq(costRates.id, id));
  await writeAudit({
    actorId: actor.id,
    action: "cost.rate.save",
    entityType: "cost_rate",
    entityId: String(id),
    before: { code: before.code, rate: before.rate },
    after: { code: before.code, rate: round2(rate) },
  });

  revalidatePath("/admin/master");
  return { ok: true };
}
