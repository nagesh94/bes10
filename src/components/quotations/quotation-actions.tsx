"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteQuotation,
  getQuotationUrl,
  regenerateQuotationPdf,
  setQuotationStatus,
} from "@/app/actions/quotations";
import { useConfirm } from "@/components/shell/confirm";
import { openFile, saveFile } from "@/lib/documents/open-file";

/**
 * Opening and re-marking a quotation.
 *
 * The URL is asked for per click rather than rendered into the list, so the
 * permission check and the audit entry happen when the file is actually
 * wanted — a quotation states a price. The link itself goes to this app and
 * is re-checked there on every request, so a page left open on a shared
 * office screen hands out nothing usable.
 */

const rowBtn =
  "h-9 shrink-0 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[12.5px] font-bold whitespace-nowrap disabled:opacity-60 bg-[var(--surface)]";

export function QuotationRowActions({
  id,
  hasPdf,
  canDelete = false,
}: {
  id: string;
  hasPdf: boolean;
  /**
   * Decided per row by the page, because the rule depends on the row: an
   * attached quotation is admin-only. The server decides again anyway — this
   * only keeps a button the person cannot use off the screen.
   */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [busy, setBusy] = useState<"open" | "download" | "delete" | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const answer = await ask({
      title: "Delete this quotation?",
      body: "The PDF goes for good. The number stays on record and is never given to another quotation.",
      confirmLabel: "Delete it",
      reason: {},
    });
    if (!answer.confirmed) return;

    setBusy("delete");
    setError(null);
    const result = await deleteQuotation(id, answer.reason);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  if (!hasPdf && !canDelete) {
    return <span className="text-[12px] text-[var(--muted)]">No PDF</span>;
  }

  // One request either way; only what the browser is told to do with the
  // answer differs — see `lib/documents/open-file`.
  async function go(mode: "open" | "download") {
    setBusy(mode);
    setFailed(false);
    const result = await getQuotationUrl(id, mode === "download" ? "attachment" : "inline");
    setBusy(null);
    if (!result.ok) return setFailed(true);
    if (mode === "download") saveFile(result.url);
    else openFile(result.url);
  }

  const tone = failed
    ? "border-[var(--red-text)] text-[var(--red-text)]"
    : "border-[var(--line)] text-[var(--link)]";

  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {hasPdf ? (
        <>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void go("open")}
            className={`${rowBtn} ${tone}`}
          >
            {busy === "open" ? "Opening…" : failed ? "Failed" : "Open PDF"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void go("download")}
            title="Save the PDF to this computer"
            className={`${rowBtn} ${
              failed
                ? "border-[var(--red-text)] text-[var(--red-text)]"
                : "border-[var(--line)] text-[var(--navy)]"
            }`}
          >
            {busy === "download" ? "Saving…" : "Download"}
          </button>
        </>
      ) : (
        <span className="text-[12px] text-[var(--muted)]">No PDF</span>
      )}
      {canDelete ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void remove()}
          className={`${rowBtn} border-[var(--red-border)] text-[var(--red-text)]`}
        >
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      ) : null}
      {error ? (
        <span className="text-[11.5px] font-semibold text-[var(--red-text)]">{error}</span>
      ) : null}
    </span>
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
  canDelete = false,
}: {
  id: string;
  status: string;
  hasPdf: boolean;
  canWrite: boolean;
  /** Already resolved against this quotation — see `QuotationRowActions`. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending("open");
    setError(null);
    const result = await getQuotationUrl(id);
    setPending(null);
    if (!result.ok) return setError(result.error);
    openFile(result.url);
  }

  async function download() {
    setPending("download");
    setError(null);
    const result = await getQuotationUrl(id, "attachment");
    setPending(null);
    if (!result.ok) return setError(result.error);
    saveFile(result.url);
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

  async function remove() {
    const answer = await ask({
      title: "Delete this quotation?",
      body: "The PDF goes for good, and the quotation leaves every list. The number stays on record and is never given to another quotation.",
      confirmLabel: "Delete it",
      reason: {},
    });
    if (!answer.confirmed) return;

    setPending("delete");
    setError(null);
    const result = await deleteQuotation(id, answer.reason);
    setPending(null);
    if (!result.ok) return setError(result.error);
    // There is nothing left to show on this page.
    router.push("/quotations");
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

        <button
          type="button"
          disabled={pending !== null || !hasPdf}
          onClick={download}
          title="Save the PDF to this computer"
          className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "download" ? "Saving…" : "Download"}
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

        {canDelete ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={remove}
            title="Remove this quotation from the list — the number stays on record"
            className="ml-auto h-11 cursor-pointer rounded-lg border border-[var(--red-border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--red-text)] disabled:opacity-60"
          >
            {pending === "delete" ? "Deleting…" : "Delete"}
          </button>
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
