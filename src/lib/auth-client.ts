"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Same-origin by default.
 *
 * NEXT_PUBLIC_* variables are inlined at build time, so pointing this at a
 * hostname would bake the environment into the bundle — the same build could
 * not then be promoted from staging to production, and a build made before the
 * domain was decided would call the wrong host. The browser already knows
 * where it loaded the page from, and the auth routes are served by this same
 * app, so the origin is the right answer and needs no configuration.
 *
 * NEXT_PUBLIC_APP_URL still wins if it is set, for the rare case of the API
 * living on a different host than the UI.
 */
const baseURL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const authClient = createAuthClient({ baseURL });

export const { signIn, signOut, useSession } = authClient;
