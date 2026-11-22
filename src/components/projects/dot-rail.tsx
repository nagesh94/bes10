/**
 * The nine stages as a row of dots: green behind, orange where it is now,
 * grey ahead. Small enough to sit in a table row and still be readable at a
 * glance down a column of twenty projects.
 */
import { useTranslations } from "next-intl";

export function DotRail({
  currentStage,
  completed,
}: {
  currentStage: number;
  completed: number;
}) {
  const t = useTranslations("projects.c");
  return (
    <div className="flex gap-[3px]" aria-label={t("stageOf", { no: currentStage, total: 9 })}>
      {Array.from({ length: 9 }, (_, i) => {
        const no = i + 1;
        const done = no <= completed;
        const now = no === currentStage && !done;
        return (
          <span
            key={no}
            className={`block h-[6px] rounded-[3px] ${now ? "w-5" : "w-3"} ${
              done
                ? "bg-[var(--stage-done)]"
                : now
                  ? "bg-[var(--stage-now)]"
                  : "bg-[var(--stage-todo)]"
            }`}
          />
        );
      })}
    </div>
  );
}
