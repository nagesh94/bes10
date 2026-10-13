"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/request";
import { getActor } from "@/lib/session";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Stored on the account when there is one, and always in a cookie so the
 * choice survives sign-out and is available on the sign-in page.
 */
export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    maxAge: ONE_YEAR,
    sameSite: "lax",
    path: "/",
  });

  const actor = await getActor();
  if (actor) {
    await db.update(user).set({ locale }).where(eq(user.id, actor.id));
  }
}

export async function setTheme(theme: "system" | "light" | "dark") {
  const actor = await getActor();
  if (!actor) return;
  await db.update(user).set({ theme }).where(eq(user.id, actor.id));
}
