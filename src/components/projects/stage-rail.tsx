import { getTranslations } from "next-intl/server";
import { STAGES } from "@/lib/workflow/stages";

export async function StageRail({
  currentStage,
  completed,
}: {
  currentStage: number;
  completed: ReadonlySet<number>;
}) {
  const t = await getTranslations("stages");

  return (
    <div className="flex flex-wrap gap-1">
      {STAGES.map((stage) => {
        const done = completed.has(stage.no);
        const now = stage.no === currentStage && !done;

        const circle = done
          ? "bg-[var(--green)] text-white"
          : now
            ? "bg-[var(--orange)] text-[var(--orange-ink)] ring-4 ring-[var(--orange-ring)]"
            : "border-[1.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--muted-soft)]";

        return (
          <div key={stage.key} className="min-w-28 flex-1 basis-32">
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className={`ref flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${circle}`}
              >
                {done ? "✓" : stage.no}
              </span>
              <span
                className={`block h-[3px] flex-1 rounded-sm ${
                  done ? "bg-[var(--green)]" : "bg-[var(--line)]"
                }`}
              />
            </div>
            <div
              className={`text-[13px] font-semibold ${
                stage.no <= currentStage ? "text-[var(--ink)]" : "text-[var(--muted-soft)]"
              }`}
            >
              {t(stage.key)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
