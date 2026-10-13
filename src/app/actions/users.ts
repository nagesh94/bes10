"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, channelPartners, user } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { assertCan } from "@/lib/rbac/permissions";
import type { Role } from "@/lib/rbac/roles";
import { getActor } from "@/lib/session";

export type UserResult = { ok: true; id: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };



/**
 * Creates a staff account.
 *
 * The password goes through Better Auth's own sign-up so it is hashed exactly
 * as a self-registered one would be — this file never touches a hash itself.
 * The role is applied afterwards, because sign-up always produces the default
 * role.
 *
 * A PARTNER account must name the partner record it belongs to, otherwise the
 * account would have a role whose every permission is scoped to a partner id
 * it does not have, and the person would see nothing at all.
 */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  partnerId?: string | null;
}): Promise<UserResult> {
  const actor = await getActor();
  assertCan(actor, "admin.users");

  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) return { ok: false, error: "A name is needed." };
  if (!email.includes("@")) return { ok: false, error: "That does not look like an email address." };
  if (input.password.length < 8) {
    return { ok: false, error: "The password needs at least 8 characters." };
  }
  if (input.role === "PARTNER" && !input.partnerId) {
    return {
      ok: false,
      error: "A partner login has to be linked to a partner record, or it will see nothing.",
    };
  }

  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing.length) return { ok: false, error: "That email already has an account." };

  try {
    await auth.api.signUpEmail({
      body: { email, password: input.password, name: input.name.trim() },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `The account could not be created: ${message}` };
  }

  const [created] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!created) return { ok: false, error: "The account was not created." };

  await db
    .update(user)
    .set({ role: input.role, partnerId: input.partnerId ?? null })
    .where(eq(user.id, created.id));

  if (input.role === "PARTNER" && input.partnerId) {
    await db
      .update(channelPartners)
      .set({ userId: created.id, updatedAt: new Date() })
      .where(eq(channelPartners.id, input.partnerId));
  }

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "admin.user.create",
    entityType: "user",
    entityId: created.id,
    after: { email, name: input.name.trim(), role: input.role },
  });

  revalidatePath("/admin/users");
  return { ok: true, id: created.id };
}

/**
 * Changes a user's role.
 *
 * An admin cannot demote themselves: it is a one-click way to lock the last
 * admin out of their own system, and undoing it needs an admin.
 */
export async function setUserRole(
  userId: string,
  role: Role,
  partnerId?: string | null,
): Promise<SimpleResult> {
  const actor = await getActor();
  assertCan(actor, "admin.users");

  if (userId === actor.id && role !== "ADMIN") {
    return { ok: false, error: "You cannot take your own admin rights away." };
  }
  if (role === "PARTNER" && !partnerId) {
    return { ok: false, error: "A partner login has to be linked to a partner record." };
  }

  const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target) return { ok: false, error: "No such user." };

  if (target.role === "ADMIN" && role !== "ADMIN") {
    const admins = await db.select().from(user).where(eq(user.role, "ADMIN"));
    if (admins.length <= 1) {
      return { ok: false, error: "This is the only admin. Promote someone else first." };
    }
  }

  await db
    .update(user)
    .set({ role, partnerId: role === "PARTNER" ? (partnerId ?? null) : null })
    .where(eq(user.id, userId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "admin.user.role",
    entityType: "user",
    entityId: userId,
    before: { role: target.role },
    after: { role, partnerId: partnerId ?? null },
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
