"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { makeAgreementPrimary } from "@/app/actions/agreements";

/**
 * Switching which of a project's agreements is the one on file.
 *
 * The same control `ChooseQuotation` is, for the same reason: a project may
 * carry two drafts while a price is being argued, and exactly one of them
 * is the agreement. Only that one is filed into the project's documents, so
 * this button decides which draft the bank loan pack prints and which one
 * the stage 2 gate counts. Nothing is deleted — the other draft is the
 * record of what else was drawn up.
 */
export function UseThisAgreement({
  id,
  primary,
  attached,
  cancelled,
}: {
  id: string;
  primary: boolean;
  /** Nothing can be a project's agreement while it is on no project. */
  attached: boolean;
  cancelled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!attached) return null;

  if (primary) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--green-text)]">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        On file
      </span>
    );
  }

  if (cancelled) {
    return (
      <span className="shrink-0 rounded-full bg-[var(--chip-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--muted)]">
        Cancelled
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        title="File this as the project's agreement — it replaces the current one in the documents and the bank loan pack"
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await makeAgreementPrimary({ id });
          setPending(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
        className="h-9 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--navy)] disabled:opacity-60"
      >
        {pending ? "Filing…" : "Use this one"}
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-[11px] font-medium text-[var(--red-text)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
