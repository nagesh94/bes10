import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { localeEnum, roleEnum, themeEnum } from "./enums";

/**
 * Better Auth owns the shape of these four tables. The extra columns at the
 * bottom of `user` are declared as additionalFields in `src/lib/auth.ts` so
 * they are typed on the session.
 *
 * Sign-in is email and password. Two-factor is deferred, not ruled out —
 * Better Auth's TOTP plugin can be enabled later without migrating anybody.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // ── BHIM additions ──
  /**
   * Every role this account holds, not one.
   *
   * A Postgres enum array rather than a join table: a user has a handful of
   * roles, they are always read all at once with the user, and there is
   * nothing to hang off the pairing — a join table would buy a query per
   * request and no expressiveness. `can()` grants a permission if any one of
   * these roles grants it, taking the widest scope.
   *
   * Never empty. An account with no roles would pass authentication and then
   * be refused everywhere, which looks like a broken app rather than a
   * disabled account; that is what `active` is for.
   */
  roles: roleEnum("roles").array().notNull().default(["EMPLOYEE"]),

  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  locale: localeEnum("locale").notNull().default("en"),
  /** Mirrored to localStorage so the right theme paints on first render. */
  theme: themeEnum("theme").notNull().default("system"),
  /** Set when the account holds the PARTNER role; links to channel_partners.id. */
  partnerId: text("partner_id"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});
