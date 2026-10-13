import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
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
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.AUTH_URL ?? "http://localhost:3000",

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
