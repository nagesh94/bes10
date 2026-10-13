"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getQuotationUrl,
  regenerateQuotationPdf,
  setQuotationStatus,
} from "@/app/actions/quotations";

/**
 * Opening and re-marking a quotation.
 *
 * The link is presigned per click rather than rendered into the list, so the
 * permission check happens when the file is actually asked for and the URL
 * expires shortly after — a quotation states a price, and a page left open
 * on a shared office screen should not hand out a permanent link to it.
 */

export function QuotationRowActions({ id, hasPdf }: { id: string; hasPdf: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!hasPdf) {
    return <span className="text-[12px] text-[var(--muted)]">No PDF</span>;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        const result = await getQuotationUrl(id);
        setBusy(false);
        if (!result.ok) return setFailed(true);
        window.open(result.url, "_blank", "noopener,noreferrer");
      }}
      className={`h-9 shrink-0 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[12.5px] font-bold whitespace-nowrap disabled:opacity-60 ${
        failed
          ? "border-[var(--red-text)] bg-[var(--surface)] text-[var(--red-text)]"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--link)]"
      }`}
    >
      {busy ? "Opening…" : failed ? "Failed" : "Open PDF"}
    </button>
  );
}

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued to customer" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
] as const;

export function QuotationControls({
  id,
  status,
  hasPdf,
  canWrite,
}: {
  id: string;
  status: string;
  hasPdf: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending("open");
    setError(null);
    const result = await getQuotationUrl(id);
    setPending(null);
    if (!result.ok) return setError(result.error);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function rebuild() {
    setPending("rebuild");
    setError(null);
    const result = await regenerateQuotationPdf(id);
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function changeStatus(next: string) {
    setPending("status");
    setError(null);
    const result = await setQuotationStatus({ id, status: next });
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={pending !== null || !hasPdf}
          onClick={open}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "open" ? "Opening…" : "Open the PDF"}
        </button>

        {canWrite ? (
          <>
            <button
              type="button"
              disabled={pending !== null}
              onClick={rebuild}
              title="Rebuild from the saved details — use after the branch address or bank details change"
              className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
            >
              {pending === "rebuild" ? "Rebuilding…" : "Rebuild PDF"}
            </button>

            <label className="ml-1 flex items-center gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
              Status
              <select
                value={status}
                disabled={pending !== null}
                onChange={(event) => void changeStatus(event.target.value)}
                className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13.5px] font-medium text-[var(--ink)]"
              >
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
