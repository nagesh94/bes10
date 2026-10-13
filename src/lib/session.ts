import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";
import type { Actor, Role } from "./rbac/permissions";

/**
 * The signed-in user, shaped for the RBAC module.
 *
 * Cached per request so a page that checks permissions in five places does
 * one session lookup.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;

  const u = result.user as typeof result.user & {
    role?: string;
    active?: boolean;
    partnerId?: string | null;
  };

  // A deactivated account keeps its session cookie but gets nothing.
  if (u.active === false) return null;

  return {
    id: u.id,
    role: (u.role ?? "EMPLOYEE") as Role,
    partnerId: u.partnerId ?? null,
  };
});

export const getCurrentUser = cache(async () => {
  const result = await auth.api.getSession({ headers: await headers() });
  return result?.user ?? null;
});
