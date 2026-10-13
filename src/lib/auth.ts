import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { APP_URL, AUTH_SECRET, AUTH_URL, isProduction } from "./env";
import { account, session, user, verification } from "./db/schema";

/**
 * Email and password only.
 *
 * Accounts are created by an admin — there is no self-registration, including
 * for channel partners. Two-factor is deferred rather than ruled out: Better
 * Auth's TOTP plugin can be switched on later without migrating anybody.
 */
export const auth = betterAuth({
  appName: "BHIM Solar CRM",
  secret: AUTH_SECRET,
  baseURL: AUTH_URL,

  /**
   * Better Auth rejects a sign-in whose Origin is not listed here, which is
   * what stops another site from driving this one with the user's cookie.
   * Behind nginx the browser's origin is the public hostname, not localhost,
   * so AUTH_URL must be the real https:// URL in production.
   */
  trustedOrigins: [AUTH_URL, APP_URL].filter(
    (u, i, all) => u && all.indexOf(u) === i,
  ) as string[],

  advanced: {
    /**
     * `__Secure-` prefix and SameSite=Lax over HTTPS. The prefix is enforced
     * by the browser: a cookie named this way is refused unless it is Secure
     * and sent from a secure origin, so a misconfigured plaintext deployment
     * fails to log anybody in instead of sending session cookies in clear.
     */
    useSecureCookies: isProduction,
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 10,
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "EMPLOYEE",
        input: false, // never settable from a sign-up payload
      },
      phone: { type: "string", required: false },
      active: { type: "boolean", required: false, defaultValue: true, input: false },
      locale: { type: "string", required: false, defaultValue: "en" },
      theme: { type: "string", required: false, defaultValue: "system" },
      partnerId: { type: "string", required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
