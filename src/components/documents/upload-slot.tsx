"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteDocument, finaliseUpload, getDocumentUrl, requestUpload } from "@/app/actions/documents";
import type { DocType } from "@/lib/documents/types";

export interface ExistingDoc {
  id: string;
  fileName: string | null;
  sizeBytes: number | null;
  uploadedAt: Date | string;
  hasPortal: boolean;
}

/**
 * One document slot: upload, then view.
 *
 * The file goes browser → storage directly through a presigned PUT, so an
 * 8 MB scan never passes through the Next server. Only once it has landed
 * does the server pull it back, build the variants and record the row.
 */
export function UploadSlot({
  projectId,
  docType,
  label,
  hint,
  accept = "image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.heic",
  existing,
  onAttached,
  canDelete = false,
}: {
  projectId: string;
  docType: DocType;
  label: string;
  hint?: string;
  accept?: string;
  existing?: ExistingDoc | null;
  /** Optional: link the new document to something, e.g. a flag's request row. */
  onAttached?: (documentId: string) => Promise<void>;
  /** Admin only — the caller passes `can(actor, "document.delete")`. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    setNotice(null);

    try {
      setBusy("Preparing…");
      const presigned = await requestUpload(projectId, docType, file.name, file.type || "application/octet-stream");
      if (!presigned.ok) {
        setError(presigned.error);
        setBusy(null);
        return;
      }

      setBusy("Uploading…");
      const put = await fetch(presigned.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) {
        setError(`Upload failed (${put.status}). Check your connection and try again.`);
        setBusy(null);
        return;
      }

      setBusy("Processing…");
      const done = await finaliseUpload(projectId, docType, presigned.tempKey, file.name);
      if (!done.ok) {
        setError(done.error);
        setBusy(null);
        return;
      }

      if (onAttached) await onAttached(done.documentId);

      setBusy(null);
      const pages = done.pageCount ? `${done.pageCount} page${done.pageCount > 1 ? "s" : ""}` : null;
      if (done.overCap) {
        setNotice(
          `Saved (${pages ? `${pages}, ` : ""}${done.portalKb} KB), but that is over the portal's cap. A PDF cannot be shrunk much — rescan at a lower DPI, or upload photos of the pages instead.`,
        );
      } else if (done.portalKb !== null) {
        setNotice(`Saved · ${pages ? `${pages} · ` : ""}portal copy ${done.portalKb} KB`);
      } else {
        setNotice(pages ? `Saved · ${pages}` : "Saved");
      }
      router.refresh();
    } catch {
      setBusy(null);
      setError("Something went wrong during the upload.");
    }
  }

  async function view() {
    if (!existing) return;
    const res = await getDocumentUrl(existing.id, "original");
    if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
    else setError(res.error);
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm(`Delete "${label}"? This removes the file and can't be undone here.`)) {
      return;
    }
    const reason = window.prompt("Reason for deleting it (optional):") ?? undefined;
    setBusy("Deleting…");
    setError(null);
    const result = await deleteDocument(existing.id, reason);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const kb = existing?.sizeBytes ? Math.round(existing.sizeBytes / 1024) : null;
  const have = Boolean(existing);

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[9px] px-3.5 py-3 ${
        have
          ? "border border-[var(--line)] bg-[var(--surface-2)]"
          : "border-[1.5px] border-dashed border-[var(--orange)] bg-[var(--orange-soft)]"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] ${
          have ? "bg-[var(--navy-soft)]" : "bg-[var(--surface)]"
        }`}
      >
        {have ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--orange-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
          </svg>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
          {busy
            ? busy
            : have
              ? `${existing!.fileName ?? "file"}${kb ? ` · ${kb} KB` : ""}`
              : (hint ?? "PDF or photo")}
        </span>
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />

      <span className="flex shrink-0 gap-2">
        {have ? (
          <button
            type="button"
            onClick={view}
            className="h-9 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--ink)]"
          >
            View
          </button>
        ) : null}
        {have && canDelete && docType !== "QUOTATION" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={remove}
            className="h-9 cursor-pointer rounded-[7px] border border-[var(--red-border)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--red-text)] disabled:opacity-60"
          >
            Delete
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          className={`h-9 cursor-pointer rounded-[7px] px-3 text-[12.5px] font-bold disabled:opacity-60 ${
            have
              ? "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--ink)]"
              : "bg-[var(--orange)] text-[var(--orange-ink)]"
          }`}
        >
          {have ? "Replace" : "Upload"}
        </button>
      </span>

      {error ? (
        <p role="alert" className="w-full text-[12px] font-medium text-[var(--red-text)]">{error}</p>
      ) : notice ? (
        <p className="w-full text-[12px] font-medium text-[var(--green-text)]">{notice}</p>
      ) : null}
    </div>
  );
}
