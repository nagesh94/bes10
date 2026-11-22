"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  deleteDocument,
  getDocumentUrl,
  regenerateGeneratedDocument,
} from "@/app/actions/documents";
import { useConfirm } from "@/components/shell/confirm";
import { openFile, saveFile } from "@/lib/documents/open-file";

/**
 * The four things a document row can do: open it, download it, regenerate
 * it (only offered for an app-generated file, never an upload), and delete
 * it (admin only — gated server-side too, this just decides what to show).
 *
 * Open and Download both ask the server for the URL on click rather than
 * render a link, same reasoning as the old `DownloadButton`: the RBAC check
 * happens at the moment the file is actually asked for, and a failure shows
 * up next to the row instead of in a blank tab. Download asks for
 * `Content-Disposition: attachment`, which is what makes the browser save
 * the file under its own name instead of displaying it — Open does not set
 * that, so a PDF or a photo opens inline in a new tab.
 */

type Busy = "open" | "download" | "regenerate" | "delete" | null;

const btn =
  "h-9 shrink-0 cursor-pointer rounded-[7px] border px-3 text-[12.5px] font-bold disabled:opacity-60 border-[var(--line)] bg-[var(--surface)] text-[var(--navy-text)]";
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
  const t = useTranslations("documents.row");
  const router = useRouter();
  const ask = useConfirm();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy("open");
    setError(null);
    const result = await getDocumentUrl(documentId, "original", "inline");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    openFile(result.url);
  }

  async function download() {
    setBusy("download");
    setError(null);
    const result = await getDocumentUrl(documentId, "original", "attachment");
    setBusy(null);
    if (!result.ok) return setError(result.error);
    saveFile(result.url);
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
    const answer = await ask({
      title: t("deleteTitle"),
      body: t("deleteBody"),
      confirmLabel: t("deleteIt"),
      reason: {},
    });
    if (!answer.confirmed) return;

    setBusy("delete");
    setError(null);
    const result = await deleteDocument(documentId, answer.reason);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      <button type="button" disabled={busy !== null} onClick={open} className={btn}>
        {busy === "open" ? t("opening") : t("open")}
      </button>
      <button type="button" disabled={busy !== null} onClick={download} className={btn}>
        {busy === "download" ? t("downloading") : t("download")}
      </button>
      {canRegenerate ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={regenerate}
          title={t("rebuildTitle")}
          className={btn}
        >
          {busy === "regenerate" ? t("regenerating") : t("regenerate")}
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" disabled={busy !== null} onClick={remove} className={dangerBtn}>
          {busy === "delete" ? t("deleting") : t("delete")}
        </button>
      ) : null}
      {error ? <span className="text-[11.5px] font-semibold text-[var(--red-text)]">{error}</span> : null}
    </span>
  );
}
