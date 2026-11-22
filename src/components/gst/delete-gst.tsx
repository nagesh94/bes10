"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteGstBill } from "@/app/actions/gst";

/** Removes a bill after one confirmation. It stays in the audit trail. */
export function DeleteGstButton({ id, invoiceNo }: { id: number; invoiceNo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete bill ${invoiceNo}? It stops counting in every total.`)) return;
    setPending(true);
    setError(null);
    const r = await deleteGstBill(id);
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push("/finance/gst");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="flex h-10 cursor-pointer items-center rounded-lg border border-[var(--red-border)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--red-text)] disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-[12.5px] text-[var(--red-text)]">
          {error}
        </p>
      ) : null}
    </>
  );
}
