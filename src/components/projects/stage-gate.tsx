"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { completeStage } from "@/app/actions/stages";

export interface GateItemView {
  id: string;
  label: string;
  passed: boolean;
  detail?: string | undefined;
}

/**
 * The gate on a stage, and the button that closes it.
 *
 * The checklist here is only a mirror — the real evaluation happens on the
 * server against the database when the button is pressed, so a stale page
 * cannot talk the app into advancing.
 */
export function StageGate({
  projectId,
  stageNo,
  title,
  blurb,
  items,
  passed,
}: {
  projectId: string;
  stageNo: number;
  title: string;
  blurb: string;
  items: GateItemView[];
  passed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");

  const outstandingCount = items.filter((i) => !i.passed).length;

  async function go(withReason?: string) {
    setPending(true);
    setError(null);
    const result = await completeStage(projectId, stageNo, withReason);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOverriding(false);
    setReason("");
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--orange-border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--orange-border)] bg-[var(--amber-surface)] px-5.5 py-4">
        <span className="ref flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--orange)] text-[13px] font-bold text-[var(--orange-ink)]">
          {stageNo}
        </span>
        <h2 className="flex-1 text-[17px] font-bold">{title}</h2>
        <span
          className={`text-[11.5px] font-bold tracking-[0.06em] uppercase ${
            passed ? "text-[var(--green-text)]" : "text-[var(--orange-text)]"
          }`}
        >
          {passed ? "Ready to close" : "In progress"}
        </span>
      </div>

      <div className="px-5.5 pt-1.5 pb-4.5">
        <p className="mt-3 mb-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{blurb}</p>

        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 border-b border-[var(--line-soft)] py-3.5"
          >
            <span
              className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                item.passed
                  ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                  : "bg-[var(--chip-soft)] text-[var(--muted-soft)]"
              }`}
            >
              {item.passed ? "✓" : "·"}
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold">{item.label}</span>
            {item.detail ? (
              <span
                className={`ref shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${
                  item.passed
                    ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                    : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
                }`}
              >
                {item.detail}
              </span>
            ) : null}
          </div>
        ))}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
          >
            {error}
          </p>
        ) : null}

        {overriding ? (
          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
            <p className="mb-2.5 text-[13px] font-semibold">
              Moving on with {outstandingCount} line{outstandingCount === 1 ? "" : "s"} still open:{" "}
              <span className="font-normal text-[var(--muted)]">
                {items.filter((i) => !i.passed).map((i) => i.label).join(", ")}.
              </span>
            </p>
            <label
              htmlFor="override-reason"
              className="mb-1.5 block text-xs font-semibold text-[var(--muted)]"
            >
              Why?
            </label>
            <textarea
              id="override-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer is travelling; the signed copy follows on Monday and the bank file is already lodged."
              className="mb-3 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--orange)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || reason.trim().length < 10}
                onClick={() => go(reason)}
                className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
              >
                {pending ? "Recording…" : "Continue and record"}
              </button>
              <button
                type="button"
                onClick={() => setOverriding(false)}
                className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2.5 text-[11.5px] text-[var(--muted)]">
              Recorded in the audit log and on the project's stage history, against your name.
            </p>
          </div>
        ) : (
          <div className="mt-4.5 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending}
              // An unticked line does not stop the project; it just means the
              // reason gets recorded. Real jobs move on with something still
              // outstanding, and a workflow that refuses gets worked around.
              onClick={() => (passed ? go() : setOverriding(true))}
              className={`h-11 cursor-pointer rounded-lg px-4.5 text-sm font-bold disabled:opacity-60 ${
                passed
                  ? "bg-[var(--orange)] text-[var(--orange-ink)]"
                  : "border border-[var(--orange)] bg-[var(--surface)] text-[var(--orange-text)]"
              }`}
            >
              {pending
                ? "Closing…"
                : passed
                  ? `Complete stage ${stageNo}`
                  : `Continue to stage ${Math.min(stageNo + 1, 9)} anyway`}
            </button>
          </div>
        )}

        {!passed && !overriding ? (
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {outstandingCount} line{outstandingCount === 1 ? "" : "s"} still open. You can move on
            without {outstandingCount === 1 ? "it" : "them"} — you will be asked why, and the
            answer stays on the project.
          </p>
        ) : null}
      </div>
    </section>
  );
}
