import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";
import type { Actor, Role } from "./rbac/permissions";

/**
 * The signed-in user, shaped for the RBAC module.
 *
 * The roles come from the user row rather than from the session payload. They
 * are an array, and an array that has to survive Better Auth's additionalFields
 * typing, the adapter's serialisation and a cached cookie is an array with
 * three places to come back as a string — so the one thing every permission
 * check in the app depends on is read straight from the column that holds it.
 * It is a primary-key lookup, and `cache` means one per request however many
 * places ask.
 *
 * Cached per request so a page that checks permissions in five places does
 * one session lookup.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;

  const [row] = await db
    .select({ roles: user.roles, active: user.active, partnerId: user.partnerId })
    .from(user)
    .where(eq(user.id, result.user.id))
    .limit(1);

  // Deleted between the session lookup and here, or deactivated: a
  // deactivated account keeps its session cookie but gets nothing.
  if (!row || !row.active) return null;

  // A row with no roles should not exist. If one does, it is treated as the
  // narrowest useful account rather than as an actor that is refused
  // everywhere, which would read as a broken app instead of a locked one.
  const roles = (row.roles?.length ? row.roles : ["EMPLOYEE"]) as Role[];

  return {
    id: result.user.id,
    roles,
    partnerId: row.partnerId ?? null,
  };
});

export const getCurrentUser = cache(async () => {
  const result = await auth.api.getSession({ headers: await headers() });
  return result?.user ?? null;
});
