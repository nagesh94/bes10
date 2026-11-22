"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteDcrCertificate } from "@/app/actions/dcr";
import { useConfirm } from "@/components/shell/confirm";

export function DeleteDcrButton({ id, certificateNo, used }: { id: number; certificateNo: string; used: number }) {
  const router = useRouter();
  const ask = useConfirm();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const answer = await ask({
      title: `Delete certificate ${certificateNo}?`,
      body:
        used > 0
          ? `${used} of its panels are recorded on projects. Those projects will be flagged until the serials are on another certificate. The PDF is deleted permanently.`
          : "The certificate, its serial list and the PDF are deleted permanently.",
      confirmLabel: "Delete",
    });
    if (!answer.confirmed) return;
    setPending(true);
    const r = await deleteDcrCertificate(id);
    setPending(false);
    if (!r.ok) return setError(r.error);
    router.push("/dcr");
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        className="h-10 cursor-pointer rounded-lg border border-[var(--red-border)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--red-text)] disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? <span className="text-[12.5px] text-[var(--red-text)]">{error}</span> : null}
    </>
  );
}
