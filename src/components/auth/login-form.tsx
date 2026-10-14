"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/shell/password-input";
import { signIn } from "@/lib/auth-client";

/**
 * Whose email to put back in the field, and whether to stay signed in.
 *
 * Only the email is kept, never the password — the session itself is the
 * cookie Better Auth sets, and `rememberMe: false` makes that cookie expire
 * with the browser instead of lasting the full thirty days. On a shared
 * office machine that is the difference between the next person finding the
 * app open and finding the login screen.
 */
const REMEMBER_KEY = "bhim.login.remember";
const EMAIL_KEY = "bhim.login.email";

function readStored() {
  try {
    return {
      remember: window.localStorage.getItem(REMEMBER_KEY) !== "0",
      email: window.localStorage.getItem(EMAIL_KEY) ?? "",
    };
  } catch {
    // Private windows and locked-down browsers throw rather than return null.
    return { remember: true, email: "" };
  }
}

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [email, setEmail] = useState("");

  // Read after mount, not during render: the server has no localStorage, and
  // reading it in the first render would make the markup mismatch.
  useEffect(() => {
    const stored = readStored();
    setRemember(stored.remember);
    if (stored.email) setEmail(stored.email);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(event.currentTarget);
    const typedEmail = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const { error: authError } = await signIn.email({
      email: typedEmail,
      password,
      rememberMe: remember,
    });

    if (authError) {
      setError(t("invalid"));
      setPending(false);
      return;
    }

    try {
      window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
      if (remember) window.localStorage.setItem(EMAIL_KEY, typedEmail);
      else window.localStorage.removeItem(EMAIL_KEY);
    } catch {
      // Not being able to remember the email is not a failed sign-in.
    }

    // "/" sends each role to its own home — an installer never sees the pipeline.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label
        htmlFor="email"
        className="mb-[7px] block text-[13px] font-semibold text-[var(--muted)]"
      >
        {t("email")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("emailPlaceholder")}
        className="mb-[18px] h-[50px] w-full rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-[14px] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
      />

      <label
        htmlFor="password"
        className="mb-[7px] block text-[13px] font-semibold text-[var(--muted)]"
      >
        {t("password")}
      </label>
      <PasswordInput
        id="password"
        name="password"
        autoComplete="current-password"
        required
        showLabel={t("showPassword")}
        hideLabel={t("hidePassword")}
        className="h-[50px] w-full rounded-[9px] border border-[var(--line)] bg-[var(--surface)] pl-[14px] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
      />

      <label className="mt-[18px] mb-6 flex cursor-pointer items-start gap-2.5 text-[13px] font-semibold text-[var(--muted)]">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--orange)]"
        />
        <span>
          {t("rememberMe")}
          <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--muted-soft)]">
            {t("rememberHint")}
          </span>
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-[50px] w-full cursor-pointer rounded-[9px] bg-[var(--orange)] text-[15px] font-bold text-[var(--orange-ink)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t("signingIn") : t("signIn")}
      </button>
    </form>
  );
}
