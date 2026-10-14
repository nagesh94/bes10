"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteAgreement,
  getAgreementUrl,
  regenerateAgreementDocx,
  setAgreementStatus,
} from "@/app/actions/agreements";
import { useConfirm } from "@/components/shell/confirm";
import { saveFile } from "@/lib/documents/open-file";

/**
 * Opening and re-marking an agreement.
 *
 * The URL is asked for per click rather than rendered into the list, so the
 * permission check and the audit entry happen when the file is actually
 * wanted — an agreement states a price. The link itself goes to this app
 * and is re-checked there on every request, so a page left open on a shared
 * office screen hands out nothing usable.
 */

const rowBtn =
  "h-9 shrink-0 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[12.5px] font-bold whitespace-nowrap disabled:opacity-60 bg-[var(--surface)]";

export function AgreementRowActions({
  id,
  hasFile,
  canDelete = false,
}: {
  id: string;
  hasFile: boolean;
  /**
   * Decided per row by the page: an agreement attached to a project is
   * admin-only. The server decides again — this only keeps a button the
   * person cannot use off the screen.
   */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy("download");
    setFailed(false);
    const result = await getAgreementUrl(id);
    setBusy(null);
    if (!result.ok) return setFailed(true);
    saveFile(result.url);
  }

  async function remove() {
    const answer = await ask({
      title: "Delete this agreement?",
      body: "The .docx goes for good. Who the parties were and what was agreed stays on record.",
      confirmLabel: "Delete it",
      reason: {},
    });
    if (!answer.confirmed) return;

    setBusy("delete");
    setError(null);
    const result = await deleteAgreement(id, answer.reason);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {hasFile ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void download()}
          className={`${rowBtn} ${
            failed
              ? "border-[var(--red-text)] text-[var(--red-text)]"
              : "border-[var(--line)] text-[var(--link)]"
          }`}
        >
          {busy === "download" ? "Preparing…" : failed ? "Failed" : "Download"}
        </button>
      ) : (
        <span className="text-[12px] text-[var(--muted)]">No file</span>
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
  { value: "ISSUED", label: "Issued for signing" },
  { value: "SIGNED", label: "Signed and scanned" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export function AgreementControls({
  id,
  status,
  hasFile,
  canWrite,
  canDelete = false,
}: {
  id: string;
  status: string;
  hasFile: boolean;
  canWrite: boolean;
  /** Already resolved against this agreement — see `AgreementRowActions`. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending("open");
    setError(null);
    const result = await getAgreementUrl(id);
    setPending(null);
    if (!result.ok) return setError(result.error);
    // A .docx is downloaded rather than opened in a tab — the browser has
    // nothing to show it in, and the lawyer wants the file anyway.
    saveFile(result.url);
  }

  async function rebuild() {
    setPending("rebuild");
    setError(null);
    const result = await regenerateAgreementDocx(id);
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function changeStatus(next: string) {
    setPending("status");
    setError(null);
    const result = await setAgreementStatus({ id, status: next });
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function remove() {
    const answer = await ask({
      title: "Delete this agreement?",
      body: "The .docx goes for good, and the agreement leaves every list. Who signed what stays on record, in the audit log.",
      confirmLabel: "Delete it",
      reason: {},
    });
    if (!answer.confirmed) return;

    setPending("delete");
    setError(null);
    const result = await deleteAgreement(id, answer.reason);
    setPending(null);
    if (!result.ok) return setError(result.error);
    // Nothing left to show here.
    router.push("/agreements");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={pending !== null || !hasFile}
          onClick={download}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "open" ? "Preparing…" : "Download the .docx"}
        </button>

        {canWrite ? (
          <>
            <button
              type="button"
              disabled={pending !== null}
              onClick={rebuild}
              title="Rebuild from the saved details — use after the clause text is corrected"
              className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
            >
              {pending === "rebuild" ? "Rebuilding…" : "Rebuild the file"}
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
            title="Remove this agreement — the audit log keeps what it was"
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
