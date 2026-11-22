"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { setStageCompletion } from "@/app/actions/stages";

/**
 * The tick that marks this stage done, on the stage's own page.
 *
 * With every gate line met it ticks straight away. With lines still open it
 * shows what is open and offers an optional reason before ticking. Unticking
 * reopens the stage after a confirm.
 */
export function StageCompleteToggle({
  projectId,
  stageNo,
  complete,
  gatePassed,
  outstanding,
}: {
  projectId: string;
  stageNo: number;
  complete: boolean;
  gatePassed: boolean;
  /** Labels of the gate lines still open. */
  outstanding: string[];
}) {
  const t = useTranslations("projects.c");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  async function save(next: boolean, withReason?: string) {
    setPending(true);
    setError(null);
    const result = await setStageCompletion(projectId, stageNo, next, withReason);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAsking(false);
    setReason("");
    router.refresh();
  }

  function onClick() {
    if (pending) return;
    if (complete) {
      if (window.confirm(t("reopenConfirm", { no: stageNo }))) void save(false);
      return;
    }
    if (gatePassed) void save(true);
    else setAsking((v) => !v);
  }

  return (
    <div className="relative">
      <button
        type="button"
        role="checkbox"
        aria-checked={complete}
        disabled={pending}
        onClick={onClick}
        className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3.5 text-[13px] font-bold disabled:opacity-60 ${
          complete
            ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-text)]"
            : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--orange)]"
        }`}
      >
        <span
          aria-hidden
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] ${
            complete
              ? "border-[var(--green)] bg-[var(--green)] text-[var(--green-ink)]"
              : "border-[var(--muted-soft)] bg-[var(--surface)]"
          }`}
        >
          {complete ? <Check size={12} strokeWidth={3.5} /> : null}
        </span>
        {pending ? t("saving") : complete ? t("stageDone") : t("markStageDone")}
      </button>

      {asking && !complete ? (
        <div className="absolute right-0 z-20 mt-2 w-[min(340px,calc(100vw-32px))] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5 shadow-lg">
          <p className="mb-2.5 text-[13px] font-semibold">
            {t("movingOn", { count: outstanding.length })}{" "}
            <span className="font-normal text-[var(--muted)]">{outstanding.join(", ")}.</span>
          </p>
          <label
            htmlFor={`tick-reason-${stageNo}`}
            className="mb-1.5 block text-xs font-semibold text-[var(--muted)]"
          >
            {t("whyOptional")}
          </label>
          <textarea
            id={`tick-reason-${stageNo}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("whyPlaceholder")}
            className="mb-3 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--orange)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => save(true, reason.trim() || undefined)}
              className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
            >
              {pending ? t("recording") : t("markAnyway")}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="absolute right-0 z-20 mt-2 w-[min(340px,calc(100vw-32px))] rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
