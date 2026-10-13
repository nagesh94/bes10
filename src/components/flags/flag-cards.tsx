"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
      <label className={labelCls} htmlFor={`khasra-${flagId}`}>Khasra number</label>
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
        {pending ? "Saving…" : "Save"}
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
      <label className={labelCls} htmlFor={`ack-${flagId}`}>DISCOM acknowledgement number</label>
      <input
        id={`ack-${flagId}`}
        name="acknowledgementNo"
        defaultValue={acknowledgementNo}
        placeholder="MPCZ/LE/2026/00000"
        className={`${field} ref mb-4`}
      />

      <label className={labelCls} htmlFor={`newload-${flagId}`}>
        Approved load, once it comes through
      </label>
      <div className="mb-4 flex items-center gap-2">
        <input
          id={`newload-${flagId}`}
          name="newSanctionedKw"
          inputMode="decimal"
          defaultValue={newSanctionedKw}
          placeholder="Pending approval"
          className={`${field} ref`}
        />
        <span className="shrink-0 text-sm text-[var(--muted)]">kW</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
        Entering the approved load also updates the bill section, so the flag clears itself on the
        next save.
      </p>
    </form>
  );
}

/** Admin-only. The reason is mandatory and goes into the audit log. */
export function WaiveFlag({ projectId, flagId }: { projectId: string; flagId: number }) {
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
        Waive this flag (admin only)
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
      <label className={labelCls} htmlFor={`reason-${flagId}`}>Why is this being waived?</label>
      <textarea
        id={`reason-${flagId}`}
        name="reason"
        rows={3}
        required
        className="mb-3 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        placeholder="Bill already in the customer's name at the DISCOM counter; printed copy is stale."
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
          {pending ? "Recording…" : "Waive and record"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-semibold"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2.5 text-[11.5px] text-[var(--muted)]">
        Recorded in the audit log against your name.
      </p>
    </form>
  );
}
