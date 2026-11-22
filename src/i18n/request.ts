import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "bhim_locale";

/**
 * One catalogue file per area of the app, under `messages/<locale>/<ns>.json`,
 * mounted at the top level under the file's name. The shared basics (nav,
 * roles, auth, common) stay in `messages/<locale>.json`.
 *
 * Splitting by area keeps each file small enough to review side by side with
 * its Hindi twin; a single 3,000-line catalogue never gets proofread.
 */
export const NAMESPACES = [
  "labels",
  "enums",
  "shell",
  "login",
  "dashboard",
  "settings",
  "projects",
  "stage",
  "prospect",
  "payments",
  "quotations",
  "agreements",
  "documents",
  "installation",
  "installer",
  "flags",
  "finance",
  "estimator",
  "partners",
  "referrals",
  "admin",
  "leads",
  "summary",
] as const;

type Messages = Record<string, unknown>;

function isObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * English underneath, the chosen locale on top. A key that has not been
 * translated yet shows in English rather than as a raw key path.
 */
function deepMerge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = isObject(value) && isObject(out[key]) ? deepMerge(out[key] as Messages, value) : value;
  }
  return out;
}

async function load(locale: Locale): Promise<Messages> {
  const base = (await import(`../messages/${locale}.json`)).default as Messages;
  const parts = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        return [ns, (await import(`../messages/${locale}/${ns}.json`)).default] as const;
      } catch {
        return [ns, {}] as const;
      }
    }),
  );
  return { ...base, ...Object.fromEntries(parts) };
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = LOCALES.includes(fromCookie as Locale)
    ? (fromCookie as Locale)
    : DEFAULT_LOCALE;

  const english = await load("en");
  const messages = locale === "en" ? english : deepMerge(english, await load(locale));

  return { locale, messages };
});
