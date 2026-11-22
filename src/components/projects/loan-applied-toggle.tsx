"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setLoanApplied } from "@/app/actions/loan";

/**
 * The "loan applied" tick on the project list.
 *
 * For the office that applied on Jan Samarth but has not uploaded the digital
 * approval letter — the letter counts on its own, so a row with it on file
 * never shows this.
 */
export function LoanAppliedToggle({
  projectId,
  applied,
}: {
  projectId: string;
  applied: boolean;
}) {
  const t = useTranslations("projects.list");
  const router = useRouter();
  const [checked, setChecked] = useState(applied);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await setLoanApplied(projectId, next);
      if (!result.ok) {
        setChecked(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label
      className="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] font-semibold text-[var(--muted)]"
      title={error ?? t("loanTickHelp")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-[var(--orange)]"
      />
      <span className={checked ? "text-[var(--green-text)]" : undefined}>
        {checked ? t("loanApplied") : t("markLoanApplied")}
      </span>
      {error ? <span className="text-[var(--red-text)]">!</span> : null}
    </label>
  );
}
