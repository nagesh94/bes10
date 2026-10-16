"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export interface SectionStep {
  key: string;
  title: string;
  done: boolean;
}

/**
 * The eight sections of the prospect form as a stepper.
 *
 * They were a list down the left, which meant the form itself started a
 * column in and nobody could tell at a glance how much of the eight was
 * left. As a stepper the sequence reads the same way the nine stages above
 * it do — same ticks, same ring, same scroll-into-view — so one habit
 * covers both levels, and the form gets the full width of the window.
 */
export function SectionStepper({
  projectId,
  steps,
  activeKey,
}: {
  projectId: string;
  steps: SectionStep[];
  activeKey: string;
}) {
  const rail = useRef<HTMLOListElement>(null);
  const active = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const box = rail.current;
    const node = active.current;
    if (!box || !node) return;
    const overflowRight = node.offsetLeft + node.offsetWidth - (box.scrollLeft + box.clientWidth);
    const overflowLeft = box.scrollLeft - node.offsetLeft;
    if (overflowRight > 0) box.scrollLeft += overflowRight + 16;
    else if (overflowLeft > 0) box.scrollLeft -= overflowLeft + 16;
  }, [activeKey]);

  return (
    <ol
      ref={rail}
      className="m-0 flex list-none gap-0 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {steps.map((step, i) => {
        const isHere = step.key === activeKey;
        return (
          <li
            key={step.key}
            ref={isHere ? active : undefined}
            className="relative min-w-[86px] flex-1 shrink-0 sm:min-w-[98px]"
          >
            <Link
              href={`/projects/${projectId}/stage-1?section=${step.key}`}
              aria-current={isHere ? "step" : undefined}
              className="group block rounded-[var(--radius-control)] px-1 pt-2 pb-2 no-underline"
            >
              <span aria-hidden className="relative flex h-6 items-center">
                <span
                  className={`absolute top-1/2 right-1/2 left-0 h-[2.5px] -translate-y-1/2 rounded-full ${
                    i === 0
                      ? "opacity-0"
                      : steps[i - 1]?.done
                        ? "bg-[var(--green)]"
                        : "bg-[var(--line)]"
                  }`}
                />
                <span
                  className={`absolute top-1/2 right-0 left-1/2 h-[2.5px] -translate-y-1/2 rounded-full ${
                    i === steps.length - 1
                      ? "opacity-0"
                      : step.done
                        ? "bg-[var(--green)]"
                        : "bg-[var(--line)]"
                  }`}
                />
                <span
                  className={`ref relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.done
                      ? "bg-[var(--green)] text-white"
                      : isHere
                        ? "bg-[var(--orange)] text-[var(--orange-ink)] ring-[3px] ring-[var(--orange-ring)]"
                        : "border-[1.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--muted-soft)] group-hover:border-[var(--muted-soft)]"
                  }`}
                >
                  {step.done ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
              </span>

              <span
                className={`mt-1.5 block text-center text-[11px] leading-[1.25] ${
                  isHere ? "font-bold text-[var(--ink)]" : "font-medium text-[var(--muted)]"
                }`}
              >
                {step.title}
              </span>

              {/* A finished section keeps its tick, so the section being
                  filled is marked underneath instead of in the circle. */}
              {isHere ? (
                <span
                  aria-hidden
                  className="mx-auto mt-1 block h-[3px] w-6 rounded-full bg-[var(--orange)]"
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
