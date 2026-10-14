"use server";

import { and, arrayContains, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { account, channelPartners, session, user } from "@/lib/db/schema";
import { newId } from "@/lib/projects/code";
import { assertCan, type Role } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import {
  inviteUserSchema,
  resetPasswordSchema,
  setUserActiveSchema,
  updateUserSchema,
  type InviteUserInput,
  type ResetPasswordInput,
  type SetUserActiveInput,
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
 * Is anyone other than this account an active admin?
 *
 * Asked before every change that could take the last admin away — losing
 * ADMIN, being disabled, or both at once. Nobody left who holds
 * `admin.users` means nobody can undo it, so the answer has to be no.
 */
async function anotherActiveAdminExists(exceptUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(arrayContains(user.roles, ["ADMIN"]), eq(user.active, true), ne(user.id, exceptUserId)),
    )
    .limit(1);
  return rows.length > 0;
}

async function writeCredential(userId: string, password: string, now: Date) {
  const hash = await hashPassword(password);
  const [cred] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);

  if (cred) {
    await db.update(account).set({ password: hash, updatedAt: now }).where(eq(account.id, cred.id));
  } else {
    await db.insert(account).values({
      id: newId("acc"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Keeps `channel_partners.user_id` pointing at whoever signs in for that
 * partner, so the referral page can be reached from either side. Dropping the
 * PARTNER role clears the old link rather than leaving a partner record
 * pointing at a login that no longer has partner permissions.
 */
async function syncPartnerLink(
  userId: string,
  previousPartnerId: string | null,
  nextPartnerId: string | null,
  now: Date,
) {
  if (previousPartnerId === nextPartnerId) return;

  if (previousPartnerId) {
    await db
      .update(channelPartners)
      .set({ userId: null, updatedAt: now })
      .where(and(eq(channelPartners.id, previousPartnerId), eq(channelPartners.userId, userId)));
  }
  if (nextPartnerId) {
    await db
      .update(channelPartners)
      .set({ userId, updatedAt: now })
      .where(eq(channelPartners.id, nextPartnerId));
  }
}

function touched() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/audit");
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
  const roles = input.roles as Role[];
  const partnerId = roles.includes("PARTNER") ? (input.partnerId ?? null) : null;

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "An account with that email already exists.", fieldErrors: { email: ["Already in use"] } };
  }

  const id = newId("usr");
  const now = new Date();

  try {
    await db.insert(user).values({
      id,
      name: input.name,
      email,
      emailVerified: true,
      roles,
      phone: input.phone?.trim() || null,
      partnerId,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeCredential(id, input.password, now);
  } catch (err) {
    if (duplicateEmail(err)) {
      return { ok: false, error: "An account with that email already exists.", fieldErrors: { email: ["Already in use"] } };
    }
    throw err;
  }

  await syncPartnerLink(id, null, partnerId, now);

  await writeAudit({
    actorId: actor.id,
    action: "user.invite",
    entityType: "user",
    entityId: id,
    after: { email, roles, name: input.name, partnerId },
  });

  touched();
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
  const roles = input.roles as Role[];
  const partnerId = roles.includes("PARTNER") ? (input.partnerId ?? null) : null;

  const [current] = await db.select().from(user).where(eq(user.id, input.id)).limit(1);
  if (!current) return { ok: false, error: "That account no longer exists." };

  // Nobody locks themselves out in one click. Another admin can do either of
  // these to them; they cannot do it to themselves and then need an admin to
  // undo it.
  if (current.id === actor.id) {
    if (!input.active) return { ok: false, error: "You cannot disable your own account." };
    if (!roles.includes("ADMIN")) {
      return { ok: false, error: "You cannot take your own admin role away." };
    }
  }

  const keepsAdmin = roles.includes("ADMIN") && input.active;
  if (current.roles.includes("ADMIN") && current.active && !keepsAdmin) {
    if (!(await anotherActiveAdminExists(current.id))) {
      return { ok: false, error: "This is the only active admin. Give someone else the role first." };
    }
  }

  const now = new Date();
  await db
    .update(user)
    .set({
      name: input.name,
      roles,
      phone: input.phone?.trim() || null,
      partnerId,
      active: input.active,
      updatedAt: now,
    })
    .where(eq(user.id, input.id));

  await syncPartnerLink(input.id, current.partnerId ?? null, partnerId, now);

  if (input.password) await writeCredential(input.id, input.password, now);

  // Disabling takes effect now, not when the cookie expires. Dropping a role
  // does too: `getActor` reads the roles column on every request, so there is
  // no stale copy in a session to clear.
  if (!input.active) {
    await db.delete(session).where(eq(session.userId, input.id));
  }

  await writeAudit({
    actorId: actor.id,
    action: "user.update",
    entityType: "user",
    entityId: input.id,
    before: {
      name: current.name,
      roles: current.roles,
      active: current.active,
      partnerId: current.partnerId,
    },
    after: {
      email: current.email,
      name: input.name,
      roles,
      active: input.active,
      partnerId,
      passwordReset: Boolean(input.password),
    },
  });

  touched();
  return { ok: true };
}

/**
 * The enable/disable switch on the row.
 *
 * Its own action rather than a trip through `updateUser`, so turning an
 * account off never carries along whatever else happened to be in a form.
 */
export async function setUserActive(raw: SetUserActiveInput): Promise<UserActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.users");

  const parsed = setUserActiveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request did not make sense." };
  const { id, active } = parsed.data;

  const [current] = await db
    .select({ id: user.id, email: user.email, roles: user.roles, active: user.active })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  if (!current) return { ok: false, error: "That account no longer exists." };
  if (current.active === active) return { ok: true };

  if (current.id === actor.id && !active) {
    return { ok: false, error: "You cannot disable your own account." };
  }

  if (!active && current.roles.includes("ADMIN") && !(await anotherActiveAdminExists(current.id))) {
    return { ok: false, error: "This is the only active admin. Give someone else the role first." };
  }

  const now = new Date();
  await db.update(user).set({ active, updatedAt: now }).where(eq(user.id, id));

  // A disabled account is turned away on its next request anyway, since
  // `getActor` checks the column. Dropping the sessions ends it immediately
  // and leaves nothing to resume if the account is re-enabled later.
  if (!active) await db.delete(session).where(eq(session.userId, id));

  await writeAudit({
    actorId: actor.id,
    action: active ? "user.enable" : "user.disable",
    entityType: "user",
    entityId: id,
    before: { active: current.active },
    after: { email: current.email, active },
  });

  touched();
  return { ok: true };
}

/**
 * Sets a new password for someone who has forgotten theirs.
 *
 * The admin types it and passes it on out of band; it is hashed on the way in
 * and cannot be read back. Every session is dropped, because the point of the
 * reset is usually that somebody else may have had the old one.
 */
export async function resetUserPassword(raw: ResetPasswordInput): Promise<UserActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.users");

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const { id, password } = parsed.data;

  const [current] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  if (!current) return { ok: false, error: "That account no longer exists." };

  const now = new Date();
  await writeCredential(id, password, now);
  await db.update(user).set({ updatedAt: now }).where(eq(user.id, id));

  // Not the admin's own sessions — resetting your own password here should
  // not sign you out of the screen you are standing on.
  if (id !== actor.id) {
    await db.delete(session).where(eq(session.userId, id));
  }

  await writeAudit({
    actorId: actor.id,
    action: "user.password",
    entityType: "user",
    entityId: id,
    after: { email: current.email, passwordReset: true },
  });

  touched();
  return { ok: true };
}
