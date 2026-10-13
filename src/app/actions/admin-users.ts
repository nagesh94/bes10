"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { account, session, user } from "@/lib/db/schema";
import { newId } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import {
  inviteUserSchema,
  updateUserSchema,
  type InviteUserInput,
  type UpdateUserInput,
} from "@/lib/validation/admin";

export type UserActionResult =
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

function duplicateEmail(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

/**
 * Creates the account directly.
 *
 * `signUpEmail` would also sign the new person in, and with the cookies
 * plugin that replaces the admin's own session. Hashing here uses the same
 * function Better Auth verifies on the way back in.
 */
export async function inviteUser(raw: InviteUserInput): Promise<UserActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.users");

  const parsed = inviteUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const input = parsed.data;
  const email = input.email.toLowerCase();

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "An account with that email already exists.", fieldErrors: { email: ["Already in use"] } };
  }

  const id = newId("usr");
  const hash = await hashPassword(input.password);
  const now = new Date();

  try {
    await db.insert(user).values({
      id,
      name: input.name,
      email,
      emailVerified: true,
      role: input.role,
      phone: input.phone?.trim() || null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(account).values({
      id: newId("acc"),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (duplicateEmail(err)) {
      return { ok: false, error: "An account with that email already exists.", fieldErrors: { email: ["Already in use"] } };
    }
    throw err;
  }

  await writeAudit({
    actorId: actor.id,
    action: "user.invite",
    entityType: "user",
    entityId: id,
    after: { email, role: input.role, name: input.name },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/audit");
  return { ok: true };
}

export async function updateUser(raw: UpdateUserInput): Promise<UserActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.users");

  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const input = parsed.data;

  const [current] = await db.select().from(user).where(eq(user.id, input.id)).limit(1);
  if (!current) return { ok: false, error: "That account no longer exists." };

  const self = current.id === actor.id;
  if (self && (!input.active || input.role !== "ADMIN")) {
    return { ok: false, error: "You cannot change your own role or deactivate yourself." };
  }

  const staysAdmin = input.role === "ADMIN" && input.active;
  if (current.role === "ADMIN" && current.active && !staysAdmin) {
    const others = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "ADMIN"), eq(user.active, true)));
    if (others.filter((row) => row.id !== current.id).length === 0) {
      return { ok: false, error: "Keep at least one active admin." };
    }
  }

  const now = new Date();
  await db
    .update(user)
    .set({
      name: input.name,
      role: input.role,
      phone: input.phone?.trim() || null,
      active: input.active,
      updatedAt: now,
    })
    .where(eq(user.id, input.id));

  if (input.password) {
    const hash = await hashPassword(input.password);
    const [cred] = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, input.id), eq(account.providerId, "credential")))
      .limit(1);
    if (cred) {
      await db.update(account).set({ password: hash, updatedAt: now }).where(eq(account.id, cred.id));
    } else {
      await db.insert(account).values({
        id: newId("acc"),
        accountId: input.id,
        providerId: "credential",
        userId: input.id,
        password: hash,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (!input.active) {
    await db.delete(session).where(eq(session.userId, input.id));
  }

  await writeAudit({
    actorId: actor.id,
    action: "user.update",
    entityType: "user",
    entityId: input.id,
    before: { name: current.name, role: current.role, active: current.active },
    after: {
      email: current.email,
      name: input.name,
      role: input.role,
      active: input.active,
      passwordReset: Boolean(input.password),
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/audit");
  return { ok: true };
}
