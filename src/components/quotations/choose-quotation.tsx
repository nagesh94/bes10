"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chooseQuotation } from "@/app/actions/quotations";

/**
 * Switching which of a project's quotations is the offer.
 *
 * A customer is routinely shown two or three — 3 kW against 5 kW, with and
 * without a battery — and one of them is the deal. Choosing does not delete
 * the others: they are the record of what else was offered, and customers
 * switch back.
 *
 * Only the chosen one is filed as the project's quotation, so this button is
 * what decides which price the bank loan pack prints. The label says so
 * rather than being a bare radio.
 */
export function ChooseQuotation({
  id,
  chosen,
  attached,
}: {
  id: string;
  chosen: boolean;
  /** Nothing can be the offer for a project it is not on. */
  attached: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!attached) return null;

  if (chosen) {
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
        Chosen
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        title="Make this the project's quotation — it replaces the current one in the bank loan pack"
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await chooseQuotation({ id });
          setPending(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
        className="h-9 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--navy)] disabled:opacity-60"
      >
        {pending ? "Choosing…" : "Choose this one"}
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-[11px] font-medium text-[var(--red-text)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
