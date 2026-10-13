import Link from "next/link";
import { STAGES } from "@/lib/workflow/stages";
import { STAGE_TITLES } from "@/lib/workflow/labels";

/**
 * The project's own navigation, in the order the work actually happens.
 *
 * Stage 1 is shown with its three parts nested under it — the prospect form,
 * the flags, and the payment plan — because all three are gate items on that
 * one stage. The payment plan is not a side page: nothing downstream makes
 * sense without an agreed number, so it belongs inside stage 1 where its
 * absence is visible.
 *
 * Stages with no page yet are greyed rather than hidden. The nine are the
 * shape of the job.
 */
const BUILT: Record<number, string> = {
  1: "stage-1",
  2: "stage-2",
  3: "stage-3",
  4: "stage-4",
  5: "stage-5",
  6: "stage-6",
  7: "stage-7",
  8: "stage-8",
  9: "stage-9",
};

interface SubItem {
  href: string | null;
  label: string;
  done: boolean;
  badge?: { text: string; tone: "amber" | "locked" | "green" } | undefined;
  note?: string | undefined;
}

function Badge({ text, tone }: { text: string; tone: "amber" | "locked" | "green" }) {
  const cls =
    tone === "amber"
      ? "bg-[var(--amber-soft)] text-[var(--amber-text)]"
      : tone === "green"
        ? "bg-[var(--green-soft)] text-[var(--green-text)]"
        : "bg-[var(--locked-soft)] text-[var(--locked-text)]";
  return (
    <span
      className={`ref ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] ${cls}`}
    >
      {text}
    </span>
  );
}

export function ProjectNav({
  projectId,
  currentStage,
  completed,
  canSeeMoney,
  canSeeDocuments,
  openFlagCount,
  sectionsComplete,
  planLocked,
}: {
  projectId: string;
  currentStage: number;
  completed: ReadonlySet<number>;
  canSeeMoney: boolean;
  canSeeDocuments: boolean;
  openFlagCount: number;
  sectionsComplete: number;
  planLocked: boolean;
}) {
  const stageOneParts: SubItem[] = [
    {
      href: `/projects/${projectId}/stage-1`,
      label: "Prospect form",
      done: sectionsComplete >= 8,
      badge: { text: `${sectionsComplete}/8`, tone: sectionsComplete >= 8 ? "green" : "amber" },
    },
    {
      href: `/projects/${projectId}/flags`,
      label: "Flags",
      done: openFlagCount === 0,
      badge:
        openFlagCount > 0
          ? { text: String(openFlagCount), tone: "amber" }
          : { text: "clear", tone: "green" },
    },
    {
      // Admin-only, and its absence is the point: the agreement downstream
      // has nothing to state until a number is agreed and locked.
      href: canSeeMoney ? `/projects/${projectId}/payments` : null,
      label: "Payment plan",
      done: planLocked,
      badge: planLocked
        ? { text: "locked", tone: "green" }
        : canSeeMoney
          ? { text: "Admin", tone: "locked" }
          : { text: "Admin", tone: "locked" },
      note: canSeeMoney ? undefined : "An admin negotiates and locks this",
    },
  ];

  return (
    <nav className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <div className="px-2 pt-1 pb-2 text-[12px] font-semibold text-[var(--muted)]">
        This project
      </div>

      {canSeeDocuments ? (
        <Link
          href={`/projects/${projectId}/documents`}
          className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-[var(--line)] px-2.5 py-2.5 no-underline"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--chip-soft)] text-[var(--chip-text)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </span>
          <span className="text-[13.5px] font-semibold text-[var(--ink)]">
            Documents — by category
          </span>
        </Link>
      ) : null}

      {STAGES.map((s) => {
        const href = BUILT[s.no];
        const done = completed.has(s.no);
        const now = s.no === currentStage;

        const head = (
          <>
            <span
              className={`ref flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold ${
                done
                  ? "bg-[var(--green)] text-white"
                  : now
                    ? "bg-[var(--orange)] text-[var(--orange-ink)]"
                    : "bg-[var(--chip-soft)] text-[var(--muted-soft)]"
              }`}
            >
              {done ? "✓" : s.no}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[13.5px] font-semibold ${
                  href ? "text-[var(--ink)]" : "text-[var(--muted-soft)]"
                }`}
              >
                {STAGE_TITLES[s.key]}
              </span>
              {!href ? (
                <span className="block text-[11px] text-[var(--muted-soft)]">Not built yet</span>
              ) : null}
            </span>
          </>
        );

        return (
          <div key={s.key}>
            {href ? (
              <Link
                href={`/projects/${projectId}/${href}`}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 no-underline ${
                  now ? "bg-[var(--orange-soft)] ring-[1.5px] ring-[var(--orange)]" : ""
                }`}
              >
                {head}
              </Link>
            ) : (
              <div className="mb-0.5 flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2.5 opacity-60">
                {head}
              </div>
            )}

            {s.no === 1 ? (
              <div className="mb-1.5 ml-[23px] border-l border-[var(--line)] pl-3">
                {stageOneParts.map((part) =>
                  part.href ? (
                    <Link
                      key={part.label}
                      href={part.href}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 no-underline"
                    >
                      <span
                        className={`block h-1.5 w-1.5 shrink-0 rounded-full ${
                          part.done ? "bg-[var(--green)]" : "bg-[var(--stage-todo)]"
                        }`}
                      />
                      <span className="text-[12.5px] font-medium text-[var(--ink)]">
                        {part.label}
                      </span>
                      {part.badge ? <Badge {...part.badge} /> : null}
                    </Link>
                  ) : (
                    <div key={part.label} className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`block h-1.5 w-1.5 shrink-0 rounded-full ${
                            part.done ? "bg-[var(--green)]" : "bg-[var(--stage-todo)]"
                          }`}
                        />
                        <span className="text-[12.5px] font-medium text-[var(--muted-soft)]">
                          {part.label}
                        </span>
                        {part.badge ? <Badge {...part.badge} /> : null}
                      </div>
                      {part.note ? (
                        <p className="mt-0.5 ml-3.5 text-[10.5px] text-[var(--muted-soft)]">
                          {part.note}
                        </p>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
