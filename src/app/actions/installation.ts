"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  auditLog,
  batteryBanks,
  batterySerials,
  earthingRecords,
  externalRefs,
  installations,
  materialConsumption,
  panelSerials,
  projects,
  structureMembers,
} from "@/lib/db/schema";
import { installerIdsFor } from "@/lib/projects/crew";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export type InstallResult = { ok: true } | { ok: false; error: string };

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined || s === null ? null : (s as string);
};
const int = (v: unknown) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const dec = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
};
/** True if a yyyy-mm-dd string is a real date after today. */
const isFutureDate = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return false;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
};

/** Checks the actor may touch this project's field work. */
async function assertFieldAccess(projectId: string, action: "installation.write" | "evidence.write") {
  const actor = await getActor();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("No such project");
  assertCan(actor, action, {
    assignedEmployeeId: project.assignedEmployeeId,
    assignedInstallerIds: await installerIdsFor(projectId),
  });
  return actor;
}

/* ── Stage 3 ─────────────────────────────────────────────────────────── */

export interface InstallationInput {
  installationDate: string;
  panelCompany: string;
  panelModelNo: string;
  panelWattPeak: string;
  totalPanels: string;
  totalCapacityKw: string;
  inverterManufacturer: string;
  inverterModelNo: string;
  inverterSerial: string;
  inverterCapacityKw: string;
  inverterCount: string;
  inverterPhase: "SINGLE" | "THREE" | "";
  isHybrid: boolean;
  acdbMake: string;
  acdbSizeType: string;
  acdbSpd: string;
  acdbMcb: string;
  dcdbMake: string;
  dcdbSizeType: string;
  dcdbSpd: string;
  dcdbMcb: string;
}

export async function saveInstallation(
  projectId: string,
  input: InstallationInput,
): Promise<InstallResult> {
  const actor = await assertFieldAccess(projectId, "installation.write");

  if (isFutureDate(input.installationDate)) {
    return { ok: false, error: "The installation date cannot be after today." };
  }

  const set = {
    installationDate: blank(input.installationDate),
    panelCompany: blank(input.panelCompany),
    panelModelNo: blank(input.panelModelNo),
    panelWattPeak: int(input.panelWattPeak),
    totalPanels: int(input.totalPanels),
    totalCapacityKw: dec(input.totalCapacityKw),
    inverterManufacturer: blank(input.inverterManufacturer),
    // Brand name is no longer asked for on its own — the generated documents
    // now read the manufacturer field for this line (see generate.ts).
    inverterModelNo: blank(input.inverterModelNo),
    inverterSerial: blank(input.inverterSerial),
    inverterCapacityKw: dec(input.inverterCapacityKw),
    inverterCount: int(input.inverterCount) ?? 1,
    inverterPhase: input.inverterPhase === "" ? null : input.inverterPhase,
    isHybrid: Boolean(input.isHybrid),
    acdbMake: blank(input.acdbMake),
    acdbSizeType: blank(input.acdbSizeType),
    acdbSpd: blank(input.acdbSpd),
    acdbMcb: blank(input.acdbMcb),
    dcdbMake: blank(input.dcdbMake),
    dcdbSizeType: blank(input.dcdbSizeType),
    dcdbSpd: blank(input.dcdbSpd),
    dcdbMcb: blank(input.dcdbMcb),
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(installations)
      .values({ projectId, ...set })
      .onConflictDoUpdate({ target: installations.projectId, set });

    // A system that is no longer hybrid should not keep a battery bank that
    // would still print into the work completion report.
    if (!set.isHybrid) {
      await tx.delete(batteryBanks).where(eq(batteryBanks.projectId, projectId));
      await tx.delete(batterySerials).where(eq(batterySerials.projectId, projectId));
    }

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "installation.save",
      entityType: "installation",
      entityId: projectId,
      projectId,
      after: set,
    });
  });

  revalidatePath(`/projects/${projectId}/stage-3`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Replaces the whole list — simpler and safer than diffing rows. */
export async function savePanelSerials(
  projectId: string,
  serials: string[],
): Promise<InstallResult> {
  const actor = await assertFieldAccess(projectId, "installation.write");
  const clean = serials.map((s) => s.trim()).filter(Boolean);

  const seen = new Set<string>();
  for (const s of clean) {
    if (seen.has(s)) return { ok: false, error: `Serial ${s} is listed twice.` };
    seen.add(s);
  }

  await db.transaction(async (tx) => {
    await tx.delete(panelSerials).where(eq(panelSerials.projectId, projectId));
    if (clean.length) {
      await tx
        .insert(panelSerials)
        .values(clean.map((serialNo, i) => ({ projectId, serialNo, sortOrder: i })));
    }
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "installation.serials",
      entityType: "installation",
      entityId: projectId,
      projectId,
      after: { count: clean.length },
    });
  });

  revalidatePath(`/projects/${projectId}/stage-3`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export interface MemberInput {
  memberType: "COLUMN" | "RAFTER" | "PURLIN";
  size: string;
  lengthM: string;
  quantity: string;
}

export async function saveStructureMembers(
  projectId: string,
  members: MemberInput[],
  structure?: { structureCompany: string; legCount: string },
): Promise<InstallResult> {
  const actor = await assertFieldAccess(projectId, "installation.write");

  const rows = members
    .filter((m) => m.size.trim() || m.lengthM.trim())
    .map((m, i) => ({
      projectId,
      memberType: m.memberType,
      size: blank(m.size),
      lengthM: dec(m.lengthM),
      quantity: int(m.quantity) ?? 1,
      sortOrder: i,
    }));

  await db.transaction(async (tx) => {
    await tx.delete(structureMembers).where(eq(structureMembers.projectId, projectId));
    if (rows.length) await tx.insert(structureMembers).values(rows);

    // The company and leg count describe the structure as a whole, so they
    // travel with the members rather than sitting on the installation's top
    // summary, away from the columns/rafters/purlins they describe.
    if (structure) {
      const set = {
        structureCompany: blank(structure.structureCompany),
        legCount: int(structure.legCount),
        updatedAt: new Date(),
      };
      await tx
        .insert(installations)
        .values({ projectId, ...set })
        .onConflictDoUpdate({ target: installations.projectId, set });
    }

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "installation.structure",
      entityType: "installation",
      entityId: projectId,
      projectId,
      after: { members: rows.length, ...structure },
    });
  });

  revalidatePath(`/projects/${projectId}/stage-3`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function saveBatteryBank(
  projectId: string,
  input: {
    manufacturer: string;
    batteryType: string;
    cellCapacity: string;
    seriesCount: string;
    parallelCount: string;
    totalCapacity: string;
    totalVoltage: string;
    serials: string[];
  },
): Promise<InstallResult> {
  const actor = await assertFieldAccess(projectId, "installation.write");

  const set = {
    manufacturer: blank(input.manufacturer),
    batteryType: blank(input.batteryType),
    cellCapacity: blank(input.cellCapacity),
    seriesCount: int(input.seriesCount),
    parallelCount: int(input.parallelCount),
    totalCapacity: blank(input.totalCapacity),
    totalVoltage: blank(input.totalVoltage),
  };

  const clean = input.serials.map((s) => s.trim()).filter(Boolean);

  await db.transaction(async (tx) => {
    await tx
      .insert(batteryBanks)
      .values({ projectId, ...set })
      .onConflictDoUpdate({ target: batteryBanks.projectId, set });
    await tx.delete(batterySerials).where(eq(batterySerials.projectId, projectId));
    if (clean.length) {
      await tx
        .insert(batterySerials)
        .values(clean.map((serialNo, i) => ({ projectId, serialNo, sortOrder: i })));
    }
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "installation.battery",
      entityType: "installation",
      entityId: projectId,
      projectId,
      after: { ...set, cells: clean.length },
    });
  });

  revalidatePath(`/projects/${projectId}/stage-3`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/* ── Stage 4 ─────────────────────────────────────────────────────────── */

export interface MaterialInput {
  category: "AC" | "DC" | "LA" | "EARTHING";
  make: string;
  lengthM: string;
  sizeSqmm: string;
  coreType: string;
  conductor: string;
}

export async function saveMaterial(
  projectId: string,
  rows: MaterialInput[],
): Promise<InstallResult> {
  const actor = await assertFieldAccess(projectId, "evidence.write");

  const used = new Set<string>();
  for (const r of rows) {
    if (used.has(r.category)) {
      return { ok: false, error: `${r.category} wire is listed more than once.` };
    }
    used.add(r.category);
    if (r.lengthM.trim() && !/^[0-9]+(\.[0-9]+)?$/.test(r.lengthM.trim())) {
      return { ok: false, error: "Length must be a number." };
    }
    if (r.sizeSqmm.trim() && !/^[0-9]+(\.[0-9]+)?$/.test(r.sizeSqmm.trim())) {
      return { ok: false, error: "Size (sqmm) must be a number." };
    }
  }

  const clean = rows
    .filter((r) => r.lengthM.trim() || r.make.trim())
    .map((r, i) => ({
      projectId,
      category: r.category,
      make: blank(r.make),
      lengthM: dec(r.lengthM),
      sizeSqmm: blank(r.sizeSqmm),
      coreType: blank(r.coreType),
      conductor: blank(r.conductor),
      sortOrder: i,
    }));

  await db.transaction(async (tx) => {
    await tx.delete(materialConsumption).where(eq(materialConsumption.projectId, projectId));
    if (clean.length) await tx.insert(materialConsumption).values(clean);
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "evidence.material",
      entityType: "installation",
      entityId: projectId,
      projectId,
      after: { runs: clean.length },
    });
  });

  revalidatePath(`/projects/${projectId}/stage-4`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function saveEarthing(
  projectId: string,
  input: {
    resistanceOhms: string;
    wireSize: string;
    wireType: string;
    twoSeparatePoints: boolean;
    cautionSignage: boolean;
    omManualProvided: boolean;
  },
): Promise<InstallResult> {
  const actor = await assertFieldAccess(projectId, "evidence.write");

  const ohms = dec(input.resistanceOhms);
  if (ohms !== null && Number(ohms) >= 2) {
    // Saved anyway — the number is the measurement, and hiding a failing one
    // helps nobody. The gate is what refuses to close.
  }

  const set = {
    resistanceOhms: ohms,
    wireSize: blank(input.wireSize),
    wireType: blank(input.wireType),
    twoSeparatePoints: Boolean(input.twoSeparatePoints),
    cautionSignage: Boolean(input.cautionSignage),
    omManualProvided: Boolean(input.omManualProvided),
    measuredOn: new Date().toISOString().slice(0, 10),
    completedAt: ohms !== null ? new Date() : null,
  };

  await db
    .insert(earthingRecords)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: earthingRecords.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "evidence.earthing",
    entityType: "installation",
    entityId: projectId,
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/stage-4`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/* ── Stages 5 and 6 ──────────────────────────────────────────────────── */

export async function saveExternalRefs(
  projectId: string,
  input: Partial<{
    dcrNumber: string;
    dcrIssuedOn: string;
    meterPaymentRef: string;
    meterPaidOn: string;
    meterAmount: string;
  }>,
): Promise<InstallResult> {
  const actor = await getActor();

  const touchesDcr = input.dcrNumber !== undefined || input.dcrIssuedOn !== undefined;
  const touchesMeter =
    input.meterPaymentRef !== undefined ||
    input.meterPaidOn !== undefined ||
    input.meterAmount !== undefined;

  // Two separate permissions, so a role could later be given one portal and
  // not the other without this action quietly granting both.
  if (touchesDcr) assertCan(actor, "portal.dcr");
  if (touchesMeter) assertCan(actor, "portal.meter");
  // Neither branch ran, so nothing above has checked who this is.
  if (!actor) throw new Error("Not signed in");
  if (!touchesDcr && !touchesMeter) return { ok: true };

  if (input.dcrIssuedOn !== undefined && isFutureDate(input.dcrIssuedOn)) {
    return { ok: false, error: "The DCR issue date cannot be after today." };
  }
  if (input.meterPaidOn !== undefined && isFutureDate(input.meterPaidOn)) {
    return { ok: false, error: "The meter payment date cannot be after today." };
  }

  const set: Record<string, unknown> = {};
  if (input.dcrNumber !== undefined) set.dcrNumber = blank(input.dcrNumber);
  if (input.dcrIssuedOn !== undefined) {
    set.dcrIssuedOn = input.dcrIssuedOn ? new Date(input.dcrIssuedOn) : null;
  }
  if (input.meterPaymentRef !== undefined) set.meterPaymentRef = blank(input.meterPaymentRef);
  if (input.meterPaidOn !== undefined) {
    set.meterPaidOn = input.meterPaidOn ? new Date(input.meterPaidOn) : null;
  }
  if (input.meterAmount !== undefined) set.meterAmount = dec(input.meterAmount);

  await db
    .insert(externalRefs)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: externalRefs.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "portal.refs.save",
    entityType: "external_refs",
    entityId: projectId,
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/stage-5`);
  revalidatePath(`/projects/${projectId}/stage-6`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
