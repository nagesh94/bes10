"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth-client";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const { error: authError } = await signIn.email({ email, password });

    if (authError) {
      setError(t("invalid"));
      setPending(false);
      return;
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
        placeholder={t("emailPlaceholder")}
        className="mb-[18px] h-[50px] w-full rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-[14px] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
      />

      <label
        htmlFor="password"
        className="mb-[7px] block text-[13px] font-semibold text-[var(--muted)]"
      >
        {t("password")}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="mb-6 h-[50px] w-full rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-[14px] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
      />

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
