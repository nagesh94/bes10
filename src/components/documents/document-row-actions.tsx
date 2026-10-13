"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteDocument,
  getDocumentUrl,
  regenerateGeneratedDocument,
} from "@/app/actions/documents";

/**
 * The four things a document row can do: open it, download it, regenerate
 * it (only offered for an app-generated file, never an upload), and delete
 * it (admin only — gated server-side too, this just decides what to show).
 *
 * Open and Download both presign on click rather than render a link, same
 * reasoning as the old `DownloadButton`: the RBAC check and the link's
 * lifetime both start at the moment the file is actually asked for.
 * Download additionally asks for `Content-Disposition: attachment`, which is
 * what makes the browser save the file under its own name instead of
 * opening it — Open does not set that, so it opens inline in a new tab.
 */

type Busy = "open" | "download" | "regenerate" | "delete" | null;

const btn =
  "h-9 shrink-0 cursor-pointer rounded-[7px] border px-3 text-[12.5px] font-bold disabled:opacity-60 border-[var(--line)] bg-[var(--surface)] text-[var(--navy)]";
const dangerBtn =
  "h-9 shrink-0 cursor-pointer rounded-[7px] border px-3 text-[12.5px] font-bold disabled:opacity-60 border-[var(--red-border)] bg-[var(--surface)] text-[var(--red-text)]";

export function DocumentRowActions({
  documentId,
  projectId,
  docType,
  canRegenerate,
  canDelete,
}: {
  documentId: string;
  projectId: string;
  docType: string;
  canRegenerate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy("open");
    setError(null);
    const result = await getDocumentUrl(documentId, "original", "inline");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function download() {
    setBusy("download");
    setError(null);
    const result = await getDocumentUrl(documentId, "original", "attachment");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    const a = document.createElement("a");
    a.href = result.url;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function regenerate() {
    setBusy("regenerate");
    setError(null);
    const result = await regenerateGeneratedDocument(projectId, docType);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this document? This removes the file and can't be undone here.")) {
      return;
    }
    const reason = window.prompt("Reason for deleting it (optional):") ?? undefined;
    setBusy("delete");
    setError(null);
    const result = await deleteDocument(documentId, reason);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      <button type="button" disabled={busy !== null} onClick={open} className={btn}>
        {busy === "open" ? "Opening…" : "Open"}
      </button>
      <button type="button" disabled={busy !== null} onClick={download} className={btn}>
        {busy === "download" ? "Downloading…" : "Download"}
      </button>
      {canRegenerate ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={regenerate}
          title="Rebuild this file from the project's current data"
          className={btn}
        >
          {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" disabled={busy !== null} onClick={remove} className={dangerBtn}>
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      ) : null}
      {error ? <span className="text-[11.5px] font-semibold text-[var(--red-text)]">{error}</span> : null}
    </span>
  );
}
