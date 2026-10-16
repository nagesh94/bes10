"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { STAGE_TITLES } from "@/lib/workflow/labels";
import { STAGE_KEYS } from "@/lib/workflow/stages";

/**
 * The nine stages as one stepper, and the only way between them.
 *
 * Every page under a project carries this, so the job is always on screen as
 * a whole and any stage is one click away — forwards to look ahead, back to
 * correct something, without going via the overview. A stage is never locked
 * out of the stepper: the gate decides what *closes* a stage, not what may
 * be looked at, and someone correcting stage 2 from stage 7 is normal work.
 *
 * Three states, each legible without colour: done carries a tick, the stage
 * the job is actually on carries a ring, and the page you are reading right
 * now is the one with the raised label. The rail scrolls sideways when the
 * window cannot hold nine labels, and the active node is scrolled into view
 * on arrival.
 */
export function StageStepper({
  projectId,
  pipelineStage,
  completed,
  activeStage = null,
}: {
  projectId: string;
  /** Where the job has actually got to. */
  pipelineStage: number;
  completed: number[];
  /** The stage whose page this is, if any. */
  activeStage?: number | null;
}) {
  const rail = useRef<HTMLOListElement>(null);
  const active = useRef<HTMLLIElement>(null);

  // Keep the stage being read inside the rail's own scroll box. Scrolling
  // the element itself would drag the whole page with it on a phone.
  useEffect(() => {
    const box = rail.current;
    const node = active.current;
    if (!box || !node) return;
    const overflowRight = node.offsetLeft + node.offsetWidth - (box.scrollLeft + box.clientWidth);
    const overflowLeft = box.scrollLeft - node.offsetLeft;
    if (overflowRight > 0) box.scrollLeft += overflowRight + 16;
    else if (overflowLeft > 0) box.scrollLeft -= overflowLeft + 16;
  }, [activeStage]);

  const done = new Set(completed);

  return (
    <ol
      ref={rail}
      className="m-0 flex list-none gap-0 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {STAGE_KEYS.map((key, i) => {
        const no = i + 1;
        const isDone = done.has(no);
        const isNow = no === pipelineStage && !isDone;
        const isHere = no === activeStage;
        const reached = no <= pipelineStage;

        return (
          <li
            key={key}
            ref={isHere ? active : undefined}
            className="relative min-w-[92px] flex-1 shrink-0 sm:min-w-[104px]"
          >
            <Link
              href={`/projects/${projectId}/stage-${no}`}
              aria-current={isHere ? "step" : undefined}
              title={`Stage ${no} · ${STAGE_TITLES[key]}`}
              className="group block rounded-[var(--radius-control)] px-1 pt-2 pb-2 no-underline"
            >
              {/* The track. Drawn behind the circle, cut at both ends of the
                  row so the rail does not appear to continue past stage 9. */}
              <span aria-hidden className="relative flex h-7 items-center">
                <span
                  className={`absolute top-1/2 right-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full ${
                    i === 0 ? "opacity-0" : done.has(no - 1) ? "bg-[var(--green)]" : "bg-[var(--line)]"
                  }`}
                />
                <span
                  className={`absolute top-1/2 right-0 left-1/2 h-[3px] -translate-y-1/2 rounded-full ${
                    i === STAGE_KEYS.length - 1
                      ? "opacity-0"
                      : isDone
                        ? "bg-[var(--green)]"
                        : "bg-[var(--line)]"
                  }`}
                />
                <span
                  className={`ref relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                    isDone
                      ? "bg-[var(--green)] text-white"
                      : isNow
                        ? "bg-[var(--orange)] text-[var(--orange-ink)] ring-4 ring-[var(--orange-ring)]"
                        : isHere
                          ? "border-[1.5px] border-[var(--orange)] bg-[var(--surface)] text-[var(--orange-text)]"
                          : "border-[1.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--muted-soft)] group-hover:border-[var(--muted-soft)]"
                  }`}
                >
                  {isDone ? <Check size={15} strokeWidth={3} /> : no}
                </span>
              </span>

              <span
                className={`mt-2 block px-0.5 text-center text-[11.5px] leading-[1.25] ${
                  isHere
                    ? "font-bold text-[var(--ink)]"
                    : reached
                      ? "font-semibold text-[var(--ink)]"
                      : "font-medium text-[var(--muted-soft)]"
                }`}
              >
                {STAGE_TITLES[key]}
              </span>

              {isHere ? (
                <span
                  aria-hidden
                  className="mx-auto mt-1.5 block h-[3px] w-7 rounded-full bg-[var(--orange)]"
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
