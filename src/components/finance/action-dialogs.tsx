"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IndianRupee, Landmark } from "lucide-react";
import { FinanceForm, RecordPaymentForm } from "@/components/payments/payment-plan-form";

/**
 * Acting on a customer from the finance tabs, without leaving the list.
 *
 * The forms are the very ones on the project's payments page — same action,
 * same validation, same audit row — wrapped in the native `<dialog>` the
 * new-lead dialog uses. Mounted only while open so each opening starts blank.
 */

function Shell({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-[30rem] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop:bg-[rgba(2,11,24,0.78)] backdrop:backdrop-blur-[3px]"
    >
      {open ? (
        <div className="max-h-[85vh] overflow-y-auto px-5 py-5">
          <h2 className="text-[18px] font-bold tracking-[-0.01em]">{title}</h2>
          <div className="mt-1 mb-4 text-[13px] text-[var(--muted)]">{subtitle}</div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function RecordPaymentDialog({
  projectId,
  code,
  customer,
  outstanding,
  milestones,
  compact = false,
}: {
  projectId: string;
  code: string;
  customer: string;
  outstanding: string;
  milestones: Array<{ id: number; label: string }>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--orange)] font-bold text-[var(--orange-ink)] hover:bg-[var(--orange-hover)] ${
          compact ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[12.5px]"
        }`}
      >
        <IndianRupee size={13} strokeWidth={2.6} aria-hidden />
        Record payment
      </button>
      <Shell
        open={open}
        onClose={() => setOpen(false)}
        title="Record a payment"
        subtitle={
          <>
            <span className="ref font-bold text-[var(--navy-text)]">{code}</span> · {customer} ·{" "}
            <span className="num font-semibold text-[var(--ink)]">{outstanding}</span> outstanding
          </>
        }
      >
        <RecordPaymentForm
          projectId={projectId}
          milestones={milestones}
          defaultOpen
          onDone={() => setOpen(false)}
        />
      </Shell>
    </>
  );
}

export function LoanDialog({
  projectId,
  code,
  customer,
  initial,
  lenderLabel,
}: {
  projectId: string;
  code: string;
  customer: string;
  initial: { loanAmount: string; status: string };
  /** The lender chosen in the payment plan, shown read-only. */
  lenderLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[12px] font-bold text-[var(--navy-text)] hover:bg-[var(--surface-2)]"
      >
        <Landmark size={13} strokeWidth={2.4} aria-hidden />
        Update loan
      </button>
      <Shell
        open={open}
        onClose={() => setOpen(false)}
        title="Update the loan"
        subtitle={
          <>
            <span className="ref font-bold text-[var(--navy-text)]">{code}</span> · {customer}
          </>
        }
      >
        <FinanceForm projectId={projectId} initial={initial} lenderLabel={lenderLabel} onDone={() => setOpen(false)} />
      </Shell>
    </>
  );
}
