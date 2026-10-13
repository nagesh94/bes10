import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LanguagePicker } from "@/components/settings/language-picker";
import { PasswordForm } from "@/components/settings/password-form";
import { ThemePicker } from "@/components/settings/theme-picker";
import { canSeeMoney } from "@/lib/rbac/permissions";
import { getActor, getCurrentUser } from "@/lib/session";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function SettingsPage() {
  const [actor, user, t, locale] = await Promise.all([
    getActor(),
    getCurrentUser(),
    getTranslations(),
    getLocale(),
  ]);
  if (!actor || !user) redirect("/login");

  const u = user as typeof user & { theme?: string; phone?: string | null };
  const theme = (u.theme ?? "system") as "system" | "light" | "dark";

  return (
    <main className="mx-auto max-w-[860px] px-6 pt-7 pb-14">
      <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">{t("nav.settings")}</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Your account, how the app looks, and what it says.
      </p>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[19px] font-bold text-[var(--navy-ink)]">
            {initials(user.name)}
          </span>
          <div className="min-w-44 flex-1">
            <div className="text-lg font-bold">{user.name}</div>
            <div className="text-[13.5px] text-[var(--muted)]">
              {user.email} · {t(`roles.${actor.role}`)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-semibold text-[var(--muted)]">
              Sees money
            </div>
            <div
              className={`mt-0.5 text-sm font-semibold ${
                canSeeMoney(actor.role) ? "text-[var(--green-text)]" : "text-[var(--muted)]"
              }`}
            >
              {canSeeMoney(actor.role) ? "Yes" : "No"}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-1 text-base font-bold">{t("common.appearance")}</h2>
        <p className="mb-4.5 text-[13px] text-[var(--muted)]">
          System follows your phone or laptop. Installers often pick dark for early-morning and
          evening site visits.
        </p>
        <ThemePicker initial={theme} />
      </section>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-1 text-base font-bold">{t("common.language")}</h2>
        <p className="mb-4.5 text-[13px] leading-relaxed text-[var(--muted)]">
          Changes labels, buttons and messages. Reference numbers, serials, IFSC codes and amounts
          always stay as they are, because they get retyped into government portals exactly as
          shown.
        </p>
        <LanguagePicker initial={locale === "hi" ? "hi" : "en"} />

        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3">
          <div className="mb-2 text-[12px] font-semibold text-[var(--muted)]">
            Example
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-2.5">
            <div>
              <div className="text-xs text-[var(--muted)]">Consumer number</div>
              <div className="ref mt-0.5 text-sm font-medium">2317015620</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Portal ID</div>
              <div className="ref mt-0.5 text-sm font-medium">NP-MPMK26-14534479</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">{t("stages.commissioning")}</div>
              <div className="mt-0.5 text-sm font-semibold">{t("stages.settlement")}</div>
            </div>
          </div>
          <p className="mt-2.5 text-[11.5px] text-[var(--muted)]">
            Switch to हिंदी and the labels change; the two numbers do not.
          </p>
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-3 text-base font-bold">Security</h2>
        <PasswordForm />
        <p className="mt-3.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
          Sign-in is email and password for now. Two-factor can be added later without changing how
          anyone signs in today.
        </p>
      </section>
    </main>
  );
}
