"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { quickGenerateAgreement } from "@/app/actions/agreements";

/**
 * "Generate agreement", at the top of Stage 1.
 *
 * Stage 1 is where the office sits with the customer filling in the
 * onboarding form, and it is where they are asked for the agreement. Having
 * to finish the form, advance a stage and find another tab to produce the
 * document the customer is waiting for is exactly the friction that sends
 * people back to Word.
 *
 * One button, two outcomes, decided on the server: it builds the file when
 * the project already knows enough, and otherwise opens the agreement form
 * with everything known already filled. What was missing travels with it,
 * so the form can say why it appeared — pressing a button marked Generate
 * and landing on a form with no explanation is its own small mystery.
 *
 * The button never sits there greyed out explaining itself, because what is
 * missing changes as the stage 1 form is filled.
 */
export function QuickGenerateAgreement({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);

    const result = await quickGenerateAgreement(projectId);

    if (result.ok) {
      router.push(`/agreements/${result.id}`);
      router.refresh();
      return;
    }

    if (result.needsForm) {
      router.push(`/agreements/new?project=${projectId}&missing=${result.missing.join(",")}`);
      return;
    }

    setPending(false);
    setError(result.error);
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? "Preparing…" : "Generate agreement"}
      </button>

      {error ? (
        <p
          role="alert"
          className="mt-1.5 max-w-64 text-right text-[11.5px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
