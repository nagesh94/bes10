import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { STAGE_KEYS } from "@/lib/workflow/stages";

const base =
  "inline-flex min-h-11 max-w-full items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink)] no-underline hover:bg-[var(--surface-2)]";

function useStageLabel() {
  const t = useTranslations("labels");
  return (no: number) => {
    const key = STAGE_KEYS[no - 1];
    return key ? t(`stageTitles.${key}`) : t("stageN", { no });
  };
}

/**
 * Back and forth between stages.
 *
 * The stepper above is for jumping; this is for the far more common move of
 * stepping one either way, and it is repeated at the foot of every stage so
 * that finishing a form and continuing does not mean scrolling back up.
 *
 * Stage 1 steps back to the overview rather than nowhere, and stage 9 has
 * the overview as its forward move — the pager is never a dead end.
 */
export function StagePager({
  projectId,
  stageNo,
  align = "between",
}: {
  projectId: string;
  stageNo: number;
  align?: "between" | "end";
}) {
  const label = useStageLabel();
  const t = useTranslations("projects.c");
  const prev = stageNo > 1 ? stageNo - 1 : null;
  const next = stageNo < STAGE_KEYS.length ? stageNo + 1 : null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        align === "end" ? "justify-end" : "justify-between"
      }`}
    >
      {prev ? (
        <Link href={`/projects/${projectId}/stage-${prev}`} className={base}>
          <ChevronLeft size={16} strokeWidth={2.4} className="shrink-0" aria-hidden />
          <span className="truncate">
            <span className="text-[var(--muted)]">{t("stagePrefix", { no: prev })} </span>
            {label(prev)}
          </span>
        </Link>
      ) : (
        <Link href={`/projects/${projectId}`} className={base}>
          <LayoutGrid size={15} strokeWidth={2.2} className="shrink-0" aria-hidden />
          {t("overview")}
        </Link>
      )}

      {next ? (
        <Link
          href={`/projects/${projectId}/stage-${next}`}
          className={`${base} border-[var(--orange-border)] bg-[var(--orange-soft)] text-[var(--orange-text)] hover:bg-[var(--orange-ring)]`}
        >
          <span className="truncate">
            <span className="opacity-75">{t("stagePrefix", { no: next })} </span>
            {label(next)}
          </span>
          <ChevronRight size={16} strokeWidth={2.4} className="shrink-0" aria-hidden />
        </Link>
      ) : (
        <Link href={`/projects/${projectId}`} className={base}>
          <span className="truncate">{t("backToOverview")}</span>
          <ChevronRight size={16} strokeWidth={2.4} className="shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  );
}

const arrow =
  "flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] no-underline hover:bg-[var(--surface-2)]";

/**
 * The same move as the pager, as two arrows, for the top of a stage where a
 * pair of full-width buttons would push the work itself below the fold.
 */
export function StageArrows({ projectId, stageNo }: { projectId: string; stageNo: number }) {
  const label = useStageLabel();
  const t = useTranslations("projects.c");
  const prev = stageNo > 1 ? stageNo - 1 : null;
  const next = stageNo < STAGE_KEYS.length ? stageNo + 1 : null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Past either end the arrow goes to the overview rather than going
          grey: a disabled control is a dead pixel where a way out belongs. */}
      <Link
        href={prev ? `/projects/${projectId}/stage-${prev}` : `/projects/${projectId}`}
        className={arrow}
        aria-label={prev ? `${t("stagePrefix", { no: prev })} ${label(prev)}` : t("overview")}
        title={prev ? `${t("stagePrefix", { no: prev })} ${label(prev)}` : t("overview")}
      >
        <ChevronLeft size={17} strokeWidth={2.4} aria-hidden />
      </Link>
      <Link
        href={next ? `/projects/${projectId}/stage-${next}` : `/projects/${projectId}`}
        className={arrow}
        aria-label={next ? `${t("stagePrefix", { no: next })} ${label(next)}` : t("overview")}
        title={next ? `${t("stagePrefix", { no: next })} ${label(next)}` : t("overview")}
      >
        <ChevronRight size={17} strokeWidth={2.4} aria-hidden />
      </Link>
    </div>
  );
}
