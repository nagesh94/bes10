"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { estimates, projects } from "@/lib/db/schema";
import { calculateEstimate } from "@/lib/estimator/engine";
import { loadRatesMap, readRates, sanitizeInputs } from "@/lib/estimator/data";
import { newId } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Saving an estimate.
 *
 * The figures stored for the list are worked out here, from sanitised inputs
 * and the current rate card — never taken from the browser. Nothing here
 * writes to expenses, cost sheets or payment plans: an estimate is only ever
 * a price to quote.
 */

export type EstimateResult = { ok: true; id: string } | { ok: false; error: string };

async function nextNumber(): Promise<string> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(substring(${estimates.number} from 5)::int), 0)` })
    .from(estimates);
  return `EST-${String((Number(row?.max) || 0) + 1).padStart(4, "0")}`;
}

export async function saveEstimate(input: {
  id?: string | null;
  name: string;
  phone?: string;
  projectId?: string | null;
  notes?: string;
  inputs: unknown;
  /** Price at today's rate card rather than the one the estimate was made with. */
  reprice?: boolean;
}): Promise<EstimateResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Give the estimate a name — the customer's, or a label." };

  let projectId: string | null = null;
  if (input.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!p) return { ok: false, error: "That project no longer exists." };
    projectId = p.id;
  }

  const inputs = sanitizeInputs(input.inputs);
  // An existing estimate keeps the rates it was priced with unless asked.
  let rates: Record<string, number> | null = null;
  if (input.id && !input.reprice) {
    const [row] = await db.select({ rates: estimates.rates }).from(estimates).where(eq(estimates.id, input.id)).limit(1);
    rates = readRates(row?.rates);
  }
  rates ??= await loadRatesMap();
  const result = calculateEstimate(inputs, rates);
  const values = {
    rates,
    name,
    phone: String(input.phone ?? "").trim().slice(0, 20) || null,
    projectId,
    notes: String(input.notes ?? "").trim().slice(0, 1000) || null,
    systemType: inputs.systemType,
    capacityKw: inputs.capacityKw.toFixed(2),
    inputs,
    cost: result.cost.toFixed(2),
    quoteWithGst: result.quoteWithGst.toFixed(2),
    customerPays: result.customerPays.toFixed(2),
    updatedAt: new Date(),
  };

  let id = input.id ?? null;
  if (id) {
    const updated = await db
      .update(estimates)
      .set(values)
      .where(and(eq(estimates.id, id), isNull(estimates.deletedAt)))
      .returning({ id: estimates.id });
    if (!updated.length) return { ok: false, error: "That estimate no longer exists." };
  } else {
    id = newId("est");
    // Two people saving at the same moment can race for a number; the
    // unique index catches it and the second simply takes the next one.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await db.insert(estimates).values({ id, number: await nextNumber(), createdBy: actor.id, ...values });
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
  }

  await writeAudit({
    actorId: actor.id,
    action: input.id ? "estimate.update" : "estimate.create",
    entityType: "estimate",
    entityId: id,
    projectId,
    after: { name, systemType: inputs.systemType, capacityKw: inputs.capacityKw, quoteWithGst: result.quoteWithGst },
  });

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${id}`);
  return { ok: true, id };
}

export async function deleteEstimate(id: string): Promise<EstimateResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");
  const [row] = await db
    .update(estimates)
    .set({ deletedAt: new Date() })
    .where(and(eq(estimates.id, id), isNull(estimates.deletedAt)))
    .returning({ id: estimates.id, projectId: estimates.projectId, number: estimates.number });
  if (!row) return { ok: false, error: "That estimate is already gone." };
  await writeAudit({
    actorId: actor.id,
    action: "estimate.delete",
    entityType: "estimate",
    entityId: id,
    projectId: row.projectId,
    before: { number: row.number },
  });
  revalidatePath("/estimates");
  return { ok: true, id };
}
