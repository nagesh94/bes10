"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setCommissioningStep, type CommissioningStep } from "@/app/actions/commissioning";

/** Stage 8: "commissioning completed" and "export started", ticked separately. */
export function CommissioningSteps({
  projectId,
  commissionedOn,
  exportStartedOn,
}: {
  projectId: string;
  /** YYYY-MM-DD, or empty when not yet ticked. */
  commissionedOn: string;
  exportStartedOn: string;
}) {
  const t = useTranslations("stage.s8");
  const router = useRouter();
  const [state, setState] = useState({ commissioning: Boolean(commissionedOn), export: Boolean(exportStartedOn) });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(step: CommissioningStep, next: boolean) {
    const previous = state;
    setState(
      step === "commissioning"
        ? { commissioning: next, export: next ? state.export : false }
        : { ...state, export: next },
    );
    setError(null);
    startTransition(async () => {
      const result = await setCommissioningStep(projectId, step, next);
      if (!result.ok) {
        setState(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const rows: Array<{ step: CommissioningStep; label: string; hint: string; on: string; disabled: boolean }> = [
    {
      step: "commissioning",
      label: t("commissioningCompleted"),
      hint: t("commissioningHint"),
      on: commissionedOn,
      disabled: pending,
    },
    {
      step: "export",
      label: t("exportStarted"),
      hint: state.commissioning ? t("exportHint") : t("exportNeedsCommissioning"),
      on: exportStartedOn,
      disabled: pending || !state.commissioning,
    },
  ];

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">{t("progress")}</h2>
      <p className="mb-4 text-[13px] text-[var(--muted)]">{t("progressHint")}</p>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const checked = state[r.step];
          return (
            <label
              key={r.step}
              className={`flex items-center gap-3 rounded-[9px] border px-4 py-3 ${
                checked
                  ? "border-[var(--green-border)] bg-[var(--green-soft)]"
                  : "border-[var(--line)] bg-[var(--surface-2)]"
              } ${r.disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={r.disabled}
                onChange={(e) => toggle(r.step, e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[var(--orange)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{r.label}</span>
                <span className="block text-[12.5px] text-[var(--muted)]">
                  {checked && r.on ? t("doneOn", { date: r.on }) : r.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-[13px] text-[var(--red-text)]">{error}</p> : null}
    </div>
  );
}
