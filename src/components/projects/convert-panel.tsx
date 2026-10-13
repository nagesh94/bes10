"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { convertToProspect } from "@/app/actions/leads";

/**
 * The Lead → Prospect gate.
 *
 * The National Portal ID is the gate itself: until the application exists on
 * PM Surya Ghar there is nothing to convert into. Converting changes a status
 * on the same row, so the code, the history and any attached document survive.
 */
export function ConvertPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const result = await convertToProspect({
      projectId,
      nationalPortalId: String(data.get("nationalPortalId") ?? ""),
    });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--orange-border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--orange-border)] bg-[var(--amber-surface)] px-5 py-4">
        <h2 className="text-base font-bold">Convert to prospect</h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--amber-body)]">
          Create the application on PM Surya Ghar first, then paste its ID here.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="p-5">
        <label htmlFor="npid" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
          National Portal ID
        </label>
        <input
          id="npid"
          name="nationalPortalId"
          required
          placeholder="NP-MPMK26-00000000"
          className="ref mb-4 h-11 w-full rounded-lg border-[1.5px] border-[var(--orange)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none"
        />

        {error ? (
          <p role="alert" className="mb-3 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3 py-2 text-[13px] font-medium text-[var(--red-text)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="h-11 w-full cursor-pointer rounded-lg bg-[var(--orange)] text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Converting…" : "Convert to prospect"}
        </button>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
          Nothing is retyped — the same record keeps its code and history, and stage 1 opens.
        </p>
      </form>
    </section>
  );
}
