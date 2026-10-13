"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  auditLog,
  channelPartners,
  commissions,
  projects,
  rooftopDetails,
} from "@/lib/db/schema";
import { newId } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export type PartnerResult = { ok: true; id: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined || s === null ? null : (s as string);
};
const money = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(n) : null;
};

export interface PartnerInput {
  name: string;
  phone: string;
  email: string;
  address: string;
  panNumber: string;
  bankAccountNumber: string;
  ifscCode: string;
  upiId: string;
  commissionBasis: "PER_KW" | "FLAT_PER_PROJECT";
  commissionRate: string;
  notes: string;
}

export async function savePartner(
  partnerId: string | null,
  input: PartnerInput,
): Promise<PartnerResult> {
  const actor = await getActor();
  assertCan(actor, "partner.write");

  if (!input.name.trim()) return { ok: false, error: "A partner needs a name." };
  if (!input.phone.trim()) return { ok: false, error: "A partner needs a phone number." };

  const set = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: blank(input.email),
    address: blank(input.address),
    panNumber: blank(input.panNumber)?.toUpperCase() ?? null,
    bankAccountNumber: blank(input.bankAccountNumber),
    ifscCode: blank(input.ifscCode)?.toUpperCase() ?? null,
    upiId: blank(input.upiId),
    commissionBasis: input.commissionBasis,
    commissionRate: money(input.commissionRate),
    notes: blank(input.notes),
    updatedAt: new Date(),
  };

  const id = partnerId ?? newId("ptr");
  if (partnerId) {
    await db.update(channelPartners).set(set).where(eq(channelPartners.id, partnerId));
  } else {
    await db.insert(channelPartners).values({ id, ...set, createdBy: actor.id });
  }

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: partnerId ? "partner.update" : "partner.create",
    entityType: "partner",
    entityId: id,
    after: set,
  });

  revalidatePath("/partners");
  return { ok: true, id };
}

/** Deactivating keeps the history; a partner with commissions is never deleted. */
export async function setPartnerActive(
  partnerId: string,
  active: boolean,
): Promise<SimpleResult> {
  const actor = await getActor();
  assertCan(actor, "partner.write");

  await db
    .update(channelPartners)
    .set({ active, updatedAt: new Date() })
    .where(eq(channelPartners.id, partnerId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: active ? "partner.activate" : "partner.deactivate",
    entityType: "partner",
    entityId: partnerId,
  });

  revalidatePath("/partners");
  return { ok: true };
}

/** Links a project to the partner who referred it. */
export async function setProjectReferrer(
  projectId: string,
  partnerId: string | null,
): Promise<SimpleResult> {
  const actor = await getActor();
  assertCan(actor, "partner.write");

  await db
    .update(projects)
    .set({ referredByPartnerId: partnerId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "partner.refer",
    entityType: "project",
    entityId: projectId,
    projectId,
    after: { partnerId },
  });

  revalidatePath("/partners");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/**
 * Accrues the commission for a referred project.
 *
 * The rate and basis are copied onto the row rather than referenced, so a
 * later rate change cannot rewrite what somebody was already owed. Accrual is
 * idempotent: a project that already has a live commission is left alone
 * rather than paying twice.
 */
export async function accrueCommission(projectId: string): Promise<SimpleResult> {
  const actor = await getActor();
  assertCan(actor, "partner.write");

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "No such project." };
  if (!project.referredByPartnerId) {
    return { ok: false, error: "This project has no referring partner." };
  }

  const existing = await db
    .select()
    .from(commissions)
    .where(eq(commissions.projectId, projectId));
  if (existing.some((c) => c.status !== "CANCELLED")) {
    return { ok: false, error: "A commission is already on file for this project." };
  }

  const [partner] = await db
    .select()
    .from(channelPartners)
    .where(eq(channelPartners.id, project.referredByPartnerId))
    .limit(1);
  if (!partner) return { ok: false, error: "That partner no longer exists." };

  const rate = Number(partner.commissionRate ?? 0);
  if (rate <= 0) return { ok: false, error: "That partner has no commission rate set." };

  const [rooftop] = await db
    .select({ plantKw: rooftopDetails.plantKw })
    .from(rooftopDetails)
    .where(eq(rooftopDetails.projectId, projectId))
    .limit(1);

  const plantKw = Number(rooftop?.plantKw ?? 0);
  if (partner.commissionBasis === "PER_KW" && plantKw <= 0) {
    return {
      ok: false,
      error: "This partner is paid per kW and the project has no plant size recorded.",
    };
  }

  const amount = partner.commissionBasis === "PER_KW" ? rate * plantKw : rate;

  await db.insert(commissions).values({
    partnerId: partner.id,
    projectId,
    basis: partner.commissionBasis,
    rate: String(rate),
    plantKw: partner.commissionBasis === "PER_KW" ? String(plantKw) : null,
    amount: String(amount),
  });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "commission.accrue",
    entityType: "partner",
    entityId: partner.id,
    projectId,
    after: { basis: partner.commissionBasis, rate, plantKw, amount },
  });

  revalidatePath("/partners");
  return { ok: true };
}

export async function setCommissionStatus(
  commissionId: number,
  status: "DUE" | "PAID" | "CANCELLED",
  detail: { reference?: string; reason?: string } = {},
): Promise<SimpleResult> {
  const actor = await getActor();
  assertCan(actor, "partner.write");

  if (status === "CANCELLED" && !detail.reason?.trim()) {
    return { ok: false, error: "Say why it is being cancelled — it is somebody's money." };
  }

  await db
    .update(commissions)
    .set({
      status,
      paidAt: status === "PAID" ? new Date() : null,
      paidReference: status === "PAID" ? (blank(detail.reference) ?? null) : null,
      cancelledReason: status === "CANCELLED" ? (blank(detail.reason) ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, commissionId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: `commission.${status.toLowerCase()}`,
    entityType: "partner",
    entityId: String(commissionId),
    after: { status, ...detail },
  });

  revalidatePath("/partners");
  return { ok: true };
}

/** A partner's own view of their referrals. Never shows another partner's. */
export async function myCommissionTotals(): Promise<{
  accrued: number;
  due: number;
  paid: number;
} | null> {
  const actor = await getActor();
  if (!actor?.partnerId) return null;

  const rows = await db
    .select()
    .from(commissions)
    .where(and(eq(commissions.partnerId, actor.partnerId)));

  const sum = (status: string) =>
    rows.filter((r) => r.status === status).reduce((n, r) => n + Number(r.amount), 0);

  return { accrued: sum("ACCRUED"), due: sum("DUE"), paid: sum("PAID") };
}
