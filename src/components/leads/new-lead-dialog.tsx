"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { NewLeadForm } from "./new-lead-form";

/**
 * Creating a lead — or a project, which is the same row at its first
 * lifecycle stage — without leaving the list you are working.
 *
 * The office adds people in runs: three walk-ins from the morning, a sheet
 * of names off a camp. Sending each one to its own page and back again cost
 * two full page loads per name and lost the filters the list was sitting on.
 * A dialog keeps the list underneath, so the new row simply appears in it.
 *
 * Built on the native `<dialog>` for the same reasons as the confirm panel:
 * it stacks above everything without a z-index fight, Escape closes it,
 * focus is trapped inside it, and the page behind it is hidden from screen
 * readers while it is open.
 */
export function NewLeadDialog({
  partners,
  label,
  title,
  blurb,
  submitLabel,
}: {
  partners: Array<{ id: string; name: string; phone: string }>;
  /** The trigger button's text — "New lead" or "Add project". */
  label: string;
  title: string;
  blurb: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)]"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden />
        {label}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="new-lead-dialog-title"
        // Escape fires `cancel`; routing it through the same path as the
        // buttons keeps `open` and the element's real state in step.
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        // A click that lands on the element itself landed on ::backdrop —
        // the panel's own children stop it before it gets here.
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="m-auto w-[calc(100vw-2rem)] max-w-[46rem] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop:bg-[rgba(2,11,24,0.55)]"
      >
        {/* Mounted only while open, so every opening starts on a blank form
            rather than whatever was half-typed and abandoned last time. */}
        {open ? (
          <div className="max-h-[85vh] overflow-y-auto px-5 py-5 sm:px-6">
            <h2
              id="new-lead-dialog-title"
              className="text-[19px] font-bold tracking-[-0.01em]"
            >
              {title}
            </h2>
            <p className="mt-1 mb-5 text-[13.5px] leading-relaxed text-[var(--muted)]">
              {blurb}
            </p>

            <NewLeadForm
              partners={partners}
              submitLabel={submitLabel}
              onCancel={() => setOpen(false)}
              onCreated={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
