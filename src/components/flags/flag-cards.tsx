"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { saveLoadChange, saveNameChange, waiveFlag } from "@/app/actions/flags";

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

export interface NameEntryView {
  source: string;
  name: string;
  verdict: "match" | "near" | "mismatch";
}

export function NameChangeForm({
  projectId,
  flagId,
  khasraNumber,
}: {
  projectId: string;
  flagId: number;
  khasraNumber: string;
}) {
  const t = useTranslations("flags");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const data = new FormData(e.currentTarget);
    await saveNameChange(projectId, flagId, {
      khasraNumber: String(data.get("khasraNumber") ?? ""),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <label className={labelCls} htmlFor={`khasra-${flagId}`}>{t("khasraNumber")}</label>
      <input
        id={`khasra-${flagId}`}
        name="khasraNumber"
        defaultValue={khasraNumber}
        placeholder="447/2"
        className={`${field} ref mb-4`}
      />
      <button
        type="submit"
        disabled={pending}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}

export function LoadChangeForm({
  projectId,
  flagId,
  acknowledgementNo,
  newSanctionedKw,
}: {
  projectId: string;
  flagId: number;
  acknowledgementNo: string;
  newSanctionedKw: string;
}) {
  const t = useTranslations("flags");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const data = new FormData(e.currentTarget);
    await saveLoadChange(projectId, flagId, {
      acknowledgementNo: String(data.get("acknowledgementNo") ?? ""),
      newSanctionedKw: String(data.get("newSanctionedKw") ?? ""),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <label className={labelCls} htmlFor={`ack-${flagId}`}>{t("ackNumber")}</label>
      <input
        id={`ack-${flagId}`}
        name="acknowledgementNo"
        defaultValue={acknowledgementNo}
        placeholder="MPCZ/LE/2026/00000"
        className={`${field} ref mb-4`}
      />

      <label className={labelCls} htmlFor={`newload-${flagId}`}>
        {t("approvedLoad")}
      </label>
      <div className="mb-4 flex items-center gap-2">
        <input
          id={`newload-${flagId}`}
          name="newSanctionedKw"
          inputMode="decimal"
          defaultValue={newSanctionedKw}
          placeholder={t("pendingApproval")}
          className={`${field} ref`}
        />
        <span className="shrink-0 text-sm text-[var(--muted)]">kW</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}

/** Admin-only. The reason is mandatory and goes into the audit log. */
export function WaiveFlag({ projectId, flagId }: { projectId: string; flagId: number }) {
  const t = useTranslations("flags");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const data = new FormData(e.currentTarget);
    const result = await waiveFlag(projectId, flagId, String(data.get("reason") ?? ""));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 h-11 w-full cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] text-[13.5px] font-semibold text-[var(--muted)]"
      >
        {t("waiveButton")}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
      <label className={labelCls} htmlFor={`reason-${flagId}`}>{t("whyWaived")}</label>
      <textarea
        id={`reason-${flagId}`}
        name="reason"
        rows={3}
        required
        className="mb-3 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        placeholder={t("waivePlaceholder")}
      />
      {error ? (
        <p role="alert" className="mb-2.5 text-[12.5px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? t("recording") : t("waiveRecord")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold"
        >
          {t("cancel")}
        </button>
      </div>
      <p className="mt-2.5 text-[11.5px] text-[var(--muted)]">
        {t("auditNote")}
      </p>
    </form>
  );
}
