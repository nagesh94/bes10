"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import {
  banks,
  cableMakes,
  discomCompanies,
  discomDivisions,
  discomZones,
  inverterModels,
  panelCompanies,
  panelModels,
  panelTypes,
  plantSizes,
  structureCompanies,
} from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import {
  addMasterSchema,
  discomLinksSchema,
  removeZoneSchema,
  setMasterActiveSchema,
  type DiscomLinksInput,
  type SetMasterActiveInput,
} from "@/lib/validation/admin";

export type MasterActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function fieldErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const raw = error.flatten().fieldErrors;
  const out: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(raw)) {
    if (messages?.length) out[key] = messages;
  }
  return out;
}

function refresh() {
  revalidatePath("/admin/master");
  revalidatePath("/admin/audit");
}

async function nameTaken(
  table:
    | typeof panelCompanies
    | typeof panelTypes
    | typeof structureCompanies
    | typeof cableMakes
    | typeof banks,
  name: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = ${name.toLowerCase()}`)
    .limit(1);
  return Boolean(row);
}

export async function addMaster(raw: unknown): Promise<MasterActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");

  const parsed = addMasterSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const input = parsed.data;

  if (
    input.category === "panel-companies" ||
    input.category === "panel-types" ||
    input.category === "structures" ||
    input.category === "cable-makes" ||
    input.category === "banks"
  ) {
    const table =
      input.category === "panel-companies"
        ? panelCompanies
        : input.category === "panel-types"
          ? panelTypes
          : input.category === "structures"
            ? structureCompanies
            : input.category === "cable-makes"
              ? cableMakes
              : banks;
    if (await nameTaken(table, input.name)) {
      return { ok: false, error: "That name is already in the list.", fieldErrors: { name: ["Already in the list"] } };
    }
    const [created] = await db.insert(table).values({ name: input.name }).returning({ id: table.id });
    await writeAudit({
      actorId: actor.id,
      action: "master.add",
      entityType: input.category,
      entityId: String(created?.id ?? ""),
      after: { name: input.name },
    });
    refresh();
    return { ok: true };
  }

  if (input.category === "panel-models") {
    const [company] = await db
      .select({ id: panelCompanies.id })
      .from(panelCompanies)
      .where(eq(panelCompanies.id, input.companyId))
      .limit(1);
    if (!company) return { ok: false, error: "That panel company no longer exists.", fieldErrors: { companyId: ["Choose a company"] } };

    const [dup] = await db
      .select({ id: panelModels.id })
      .from(panelModels)
      .where(and(eq(panelModels.companyId, input.companyId), sql`lower(${panelModels.modelNo}) = ${input.modelNo.toLowerCase()}`))
      .limit(1);
    if (dup) {
      return { ok: false, error: "That company already has this model number.", fieldErrors: { modelNo: ["Already listed"] } };
    }

    const [created] = await db
      .insert(panelModels)
      .values({
        companyId: input.companyId,
        modelNo: input.modelNo,
        wattPeak: input.wattPeak,
        isDcr: input.isDcr,
      })
      .returning({ id: panelModels.id });
    await writeAudit({
      actorId: actor.id,
      action: "master.add",
      entityType: "panel-models",
      entityId: String(created?.id ?? ""),
      after: { modelNo: input.modelNo, wattPeak: input.wattPeak, isDcr: input.isDcr },
    });
    refresh();
    return { ok: true };
  }

  if (input.category === "inverters") {
    const [created] = await db
      .insert(inverterModels)
      .values({
        manufacturer: input.manufacturer,
        brandName: input.brandName?.trim() || null,
        modelNo: input.modelNo,
        capacityKw: input.capacityKw.toFixed(2),
      })
      .returning({ id: inverterModels.id });
    await writeAudit({
      actorId: actor.id,
      action: "master.add",
      entityType: "inverters",
      entityId: String(created?.id ?? ""),
      after: { manufacturer: input.manufacturer, modelNo: input.modelNo, capacityKw: input.capacityKw },
    });
    refresh();
    return { ok: true };
  }

  if (input.category === "plant-sizes") {
    const label = input.label?.trim() || `${input.kw} kW`;
    const [created] = await db
      .insert(plantSizes)
      .values({ kw: input.kw.toFixed(2), label })
      .returning({ id: plantSizes.id });
    await writeAudit({
      actorId: actor.id,
      action: "master.add",
      entityType: "plant-sizes",
      entityId: String(created?.id ?? ""),
      after: { label, kw: input.kw },
    });
    refresh();
    return { ok: true };
  }

  const [division] = await db
    .select({ id: discomDivisions.id })
    .from(discomDivisions)
    .where(eq(discomDivisions.id, input.divisionId))
    .limit(1);
  if (!division) return { ok: false, error: "That division no longer exists.", fieldErrors: { divisionId: ["Choose a division"] } };

  const [created] = await db
    .insert(discomZones)
    .values({ divisionId: input.divisionId, name: input.name })
    .returning({ id: discomZones.id });
  await writeAudit({
    actorId: actor.id,
    action: "discom.zone.add",
    entityType: "discom-zone",
    entityId: String(created?.id ?? ""),
    after: { name: input.name, divisionId: input.divisionId },
  });
  refresh();
  return { ok: true };
}

const ACTIVE_TABLE = {
  "panel-companies": panelCompanies,
  "panel-types": panelTypes,
  "panel-models": panelModels,
  inverters: inverterModels,
  structures: structureCompanies,
  "cable-makes": cableMakes,
  banks,
  "plant-sizes": plantSizes,
} as const;

export async function setMasterActive(raw: SetMasterActiveInput): Promise<MasterActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");

  const parsed = setMasterActiveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That row could not be updated." };
  const input = parsed.data;
  const table = ACTIVE_TABLE[input.category];

  await db.update(table).set({ active: input.active }).where(eq(table.id, input.id));
  await writeAudit({
    actorId: actor.id,
    action: input.active ? "master.restore" : "master.retire",
    entityType: input.category,
    entityId: String(input.id),
    after: { active: input.active },
  });
  refresh();
  return { ok: true };
}

export async function saveDiscomLinks(raw: DiscomLinksInput): Promise<MasterActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");

  const parsed = discomLinksSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the portal addresses.", fieldErrors: fieldErrors(parsed.error) };
  }
  const input = parsed.data;
  const blank = (value: string) => value.trim() || null;

  const [current] = await db.select().from(discomCompanies).where(eq(discomCompanies.id, input.id)).limit(1);
  if (!current) return { ok: false, error: "That DISCOM no longer exists." };

  const after = {
    nameChangeUrl: blank(input.nameChangeUrl),
    loadEnhancementUrl: blank(input.loadEnhancementUrl),
    meterPortalUrl: blank(input.meterPortalUrl),
    landRecordsUrl: blank(input.landRecordsUrl),
  };

  await db.update(discomCompanies).set(after).where(eq(discomCompanies.id, input.id));
  await writeAudit({
    actorId: actor.id,
    action: "discom.links",
    entityType: "discom",
    entityId: String(input.id),
    before: {
      nameChangeUrl: current.nameChangeUrl,
      loadEnhancementUrl: current.loadEnhancementUrl,
      meterPortalUrl: current.meterPortalUrl,
      landRecordsUrl: current.landRecordsUrl,
    },
    after,
  });
  refresh();
  return { ok: true };
}

export async function removeDiscomZone(raw: { id: number }): Promise<MasterActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");

  const parsed = removeZoneSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That zone could not be removed." };

  const [zone] = await db.select().from(discomZones).where(eq(discomZones.id, parsed.data.id)).limit(1);
  if (!zone) return { ok: false, error: "That zone is already gone." };

  await db.delete(discomZones).where(eq(discomZones.id, zone.id));
  await writeAudit({
    actorId: actor.id,
    action: "discom.zone.remove",
    entityType: "discom-zone",
    entityId: String(zone.id),
    before: { name: zone.name },
  });
  refresh();
  return { ok: true };
}
