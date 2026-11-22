"use client";

import { useEffect, useState } from "react";

/**
 * What the screen shows while a certificate is read.
 *
 * Reading is one server call, so the steps cannot report real progress one
 * by one. They advance on the timings measured for a NISE certificate (text
 * and parser well under a second, Gemini around eight), and the step that
 * waits on Gemini stays open until the answer actually arrives — the bar
 * never claims to be finished before it is. `done` completes every step.
 */

const STEPS = [
  { key: "upload", label: "Uploading the PDF", until: 0.6 },
  { key: "text", label: "Extracting the text", until: 1.3 },
  { key: "parse", label: "Reading fields and serial numbers", until: 2.1 },
  { key: "llm", label: "Checking every field with Gemini", until: Infinity },
  { key: "match", label: "Cross-checking and matching the supplier", until: Infinity },
] as const;

/** Gemini's share of the wait; the bar eases toward 92% while it runs. */
const EXPECTED_SECONDS = 9;

/** Wording for a document other than a DCR certificate. */
export interface ReadingWords {
  reading: string;
  read: string;
  parse: string;
  llm: string;
  match: string;
}

export function ReadingProgress({
  fileName,
  sizeBytes,
  done,
  words,
}: {
  fileName: string;
  sizeBytes: number;
  done: boolean;
  words?: ReadingWords;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (done) return;
    const start = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, [done]);

  const activeIndex = done ? STEPS.length : Math.max(0, STEPS.findIndex((s) => elapsed < s.until));
  const progress = done ? 100 : Math.min(92, 92 * (1 - Math.exp(-elapsed / (EXPECTED_SECONDS / 2.2))));
  const kb = sizeBytes / 1024;

  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]"
    >
      <div className="flex flex-col items-center gap-7 px-6 py-8 sm:flex-row sm:items-start sm:gap-10 sm:px-10">
        <ScanningDocument done={done} />

        <div className="w-full min-w-0 flex-1">
          <div className="dcr-rise mb-1 text-[17px] font-bold">
            {done ? (words?.read ?? "Certificate read") : (words?.reading ?? "Reading the certificate…")}
          </div>
          <div className="dcr-rise mb-5 truncate text-[12.5px] text-[var(--muted)]" style={{ animationDelay: "60ms" }}>
            <span className="ref">{fileName}</span> · {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`}
            {!done && elapsed >= 1 ? ` · ${Math.floor(elapsed)}s` : ""}
          </div>

          <ol className="mb-5 space-y-2.5">
            {STEPS.map((s, i) => {
              const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "waiting";
              return (
                <li
                  key={s.key}
                  className="dcr-rise flex items-center gap-3 text-[13.5px]"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <StepIcon state={state} />
                  <span
                    className={
                      state === "waiting"
                        ? "text-[var(--muted-soft)]"
                        : state === "active"
                          ? "font-semibold text-[var(--ink)]"
                          : "text-[var(--muted)]"
                    }
                  >
                    {(words && s.key !== "upload" && s.key !== "text" ? words[s.key] : null) ?? s.label}
                  </span>
                  {state === "active" && s.key === "llm" && elapsed > 14 ? (
                    <span className="text-[12px] text-[var(--muted)]">— Gemini is busy, trying again</span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--data-track)]">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--orange)] transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
            {!done ? <span className="dcr-shimmer absolute inset-0" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIcon({ state }: { state: "done" | "active" | "waiting" }) {
  if (state === "done") {
    return (
      <span className="dcr-pop flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-[11px] font-bold text-[var(--green-ink)]">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        aria-hidden
        className="block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--orange-ring)] border-t-[var(--orange)]"
      />
    );
  }
  return <span aria-hidden className="block h-5 w-5 shrink-0 rounded-full border-2 border-[var(--line)]" />;
}

/** A page with text lines writing themselves in and a scan line sweeping down it. */
function ScanningDocument({ done }: { done: boolean }) {
  const lines = [88, 62, 0, 94, 78, 90, 0, 70, 84, 46];
  return (
    <div className="relative h-[170px] w-[132px] shrink-0">
      {/* stacked sheets behind */}
      <span className="absolute inset-0 translate-x-2 translate-y-2 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)]" />
      <div
        className={`relative h-full w-full overflow-hidden rounded-[10px] border bg-[var(--surface)] shadow-[var(--shadow-float)] transition-colors duration-500 ${
          done ? "border-[var(--green-border)]" : "border-[var(--line)]"
        }`}
      >
        {/* header band, like the NISE letterhead */}
        <div className="flex items-center gap-1.5 px-3 pt-3">
          <span className="block h-4 w-4 rounded-full bg-[var(--gold-soft)]" />
          <span className="block h-1.5 w-12 rounded-full bg-[var(--navy-soft)]" />
        </div>
        <div className="space-y-[7px] px-3 pt-3">
          {lines.map((w, i) =>
            w === 0 ? (
              <span key={i} className="block h-1" />
            ) : (
              <span
                key={i}
                className="dcr-text-line block h-[5px] rounded-full bg-[var(--line)]"
                style={{ width: `${w}%`, animationDelay: `${200 + i * 140}ms` }}
              />
            ),
          )}
        </div>
        {/* serial "chips" at the foot */}
        <div className="absolute inset-x-3 bottom-3 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="dcr-text-line block h-2.5 flex-1 rounded-[3px] bg-[var(--navy-soft)]"
              style={{ animationDelay: `${1700 + i * 160}ms` }}
            />
          ))}
        </div>

        {done ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]/70">
            <span className="dcr-pop flex h-12 w-12 items-center justify-center rounded-full bg-[var(--green)] text-xl font-bold text-[var(--green-ink)] shadow-[var(--shadow-float)]">
              ✓
            </span>
          </div>
        ) : (
          <span
            aria-hidden
            className="dcr-scan-line pointer-events-none absolute inset-x-0 top-2 block h-6"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--orange) 22%, transparent) 70%, var(--orange) 100%)",
            }}
          />
        )}
      </div>
    </div>
  );
}
