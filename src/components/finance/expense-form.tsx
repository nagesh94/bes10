"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteExpense, recordExpense } from "@/app/actions/expenses";
import { Combobox } from "@/components/finance/combobox";
import { useConfirm } from "@/components/shell/confirm";
import type { ExpenseFormOptions } from "@/lib/finance/expenses";
import { PAID_OUT_MODES, RECEIVED_MODE_LABELS, type PaidOutMode } from "@/lib/payments/schedule";

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const SOMEONE_ELSE = "__someone_else";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Recording money spent.
 *
 * The category leads: once it is picked the form asks only what that kind
 * of spend needs — whose salary, which site the cement went to, what "Other"
 * actually was. Everything is re-checked by the server action.
 */
export function AddExpenseDialog({
  options,
  defaultProjectId,
  defaultCategoryId,
  label = "Add expense",
  compact = false,
  ghost = false,
}: {
  options: ExpenseFormOptions;
  /** Pre-picks the site when opened from a project's own page. */
  defaultProjectId?: string;
  /** Pre-picks the category when opened from a cost-calculator line. */
  defaultCategoryId?: number;
  label?: string;
  compact?: boolean;
  /** A quiet outline button, for a row of them. */
  ghost?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg font-bold ${
          ghost
            ? "h-8 border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--navy-text)] hover:bg-[var(--surface-2)]"
            : `bg-[var(--orange)] text-[var(--orange-ink)] hover:bg-[var(--orange-hover)] ${
                compact ? "h-9 px-3.5 text-[12.5px]" : "h-11 px-5 text-sm"
              }`
        }`}
      >
        <Plus size={compact || ghost ? 13 : 16} strokeWidth={2.6} aria-hidden />
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="expense-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[calc(100vw-2rem)] max-w-[40rem] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-float)] backdrop:bg-[rgba(2,11,24,0.78)] backdrop:backdrop-blur-[3px]"
      >
        {open ? (
          <div className="max-h-[88vh] overflow-y-auto px-5 py-5 sm:px-6">
            <h2 id="expense-dialog-title" className="text-[19px] font-bold tracking-[-0.01em]">
              Record an expense
            </h2>
            <p className="mt-1 mb-4 text-[13px] text-[var(--muted)]">
              Money paid out — for a site, a person or the business.
            </p>
            <ExpenseForm
              options={options}
              defaultProjectId={defaultProjectId}
              defaultCategoryId={defaultCategoryId}
              onDone={() => setOpen(false)}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function ExpenseForm({
  options,
  defaultProjectId,
  defaultCategoryId,
  onDone,
}: {
  options: ExpenseFormOptions;
  defaultProjectId?: string;
  defaultCategoryId?: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(defaultCategoryId ? String(defaultCategoryId) : "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [person, setPerson] = useState("");
  const [personTyped, setPersonTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const category = options.categories.find((c) => String(c.id) === categoryId);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!category) return setError({ message: "Choose what the money was spent on.", field: "categoryId" });
        setPending(true);
        const data = new FormData(e.currentTarget);
        const text = (k: string) => String(data.get(k) ?? "");
        const result = await recordExpense({
          spentOn: text("spentOn"),
          amount: text("amount"),
          categoryId: category.id,
          projectId: projectId || null,
          paidTo: text("paidTo"),
          mode: text("mode") as PaidOutMode,
          referenceNo: text("referenceNo"),
          personUserId: person && person !== SOMEONE_ELSE ? person : null,
          personName: person === SOMEONE_ELSE ? personTyped : "",
          details: text("details"),
        });
        setPending(false);
        if (!result.ok) return setError({ message: result.error, field: result.field });
        onDone();
        router.refresh();
      }}
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="exp-category">Spent on</label>
          <Combobox
            id="exp-category"
            placeholder="Search: material, transport, salary…"
            value={categoryId}
            onChange={setCategoryId}
            invalid={error?.field === "categoryId"}
            options={options.categories.map((c) => ({ value: String(c.id), label: c.name, hint: c.hint }))}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="exp-amount">Amount</label>
          <input id="exp-amount" name="amount" required inputMode="decimal" placeholder="12,500" className={`${field} ref`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="exp-date">Paid on</label>
          <input id="exp-date" name="spentOn" type="date" required defaultValue={today()} max={today()} className={field} />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="exp-project">
            {category?.perSite ? "Site (project)" : "Site (project) — optional"}
          </label>
          <Combobox
            id="exp-project"
            placeholder={category?.perSite ? "Search by project code or customer" : "Leave empty for an office expense"}
            value={projectId}
            onChange={setProjectId}
            emptyLabel="No site — office expense"
            invalid={error?.field === "projectId"}
            options={options.projects.map((p) => ({ value: p.id, label: p.label }))}
          />
          {category?.perSite && !projectId ? (
            <span className="mt-1 block text-[11.5px] text-[var(--amber-text)]">
              This is usually spent on a site. Pick it so the project&rsquo;s margin is right.
            </span>
          ) : null}
        </div>

        {category?.needsPerson ? (
          <>
            <div className={person === SOMEONE_ELSE ? "" : "sm:col-span-2"}>
              <label className={labelCls} htmlFor="exp-person">For whom</label>
              <Combobox
                id="exp-person"
                placeholder="Search staff"
                value={person}
                onChange={setPerson}
                invalid={error?.field === "person"}
                options={[
                  ...options.people.map((p) => ({ value: p.id, label: p.name })),
                  { value: SOMEONE_ELSE, label: "Someone else — type the name" },
                ]}
              />
            </div>
            {person === SOMEONE_ELSE ? (
              <div>
                <label className={labelCls} htmlFor="exp-person-name">Name</label>
                <input
                  id="exp-person-name"
                  value={personTyped}
                  onChange={(e) => setPersonTyped(e.target.value)}
                  required
                  className={field}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <div>
          <label className={labelCls} htmlFor="exp-paid-to">Paid to</label>
          <input id="exp-paid-to" name="paidTo" placeholder="Vendor, transporter, office…" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls} htmlFor="exp-mode">Mode</label>
            <select id="exp-mode" name="mode" className={field} defaultValue="UPI">
              {PAID_OUT_MODES.map((m) => (
                <option key={m} value={m}>{RECEIVED_MODE_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-ref">Reference</label>
            <input id="exp-ref" name="referenceNo" placeholder="UTR / bill no." className={`${field} ref`} />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="exp-details">
            {category?.needsDetail ? "What was it for, and where was the money used?" : "Details — optional"}
          </label>
          <textarea
            id="exp-details"
            name="details"
            rows={2}
            required={category?.needsDetail}
            placeholder={
              category?.needsDetail
                ? "e.g. Medical bills for family, repaid next month"
                : "e.g. 20 bags of cement for column footing"
            }
            className={`w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)] ${
              error?.field === "details" ? "border-[var(--red-border)]" : "border-[var(--line)]"
            }`}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3.5 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
          {error.message}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Record expense"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeleteExpenseButton({ id, summary }: { id: string; summary: string }) {
  const router = useRouter();
  const ask = useConfirm();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${summary}`}
      title="Remove"
      onClick={async () => {
        const answer = await ask({
          title: "Remove this expense?",
          body: `${summary}. It stops counting everywhere; the audit log keeps a record.`,
          confirmLabel: "Remove",
          reason: { label: "Why?", placeholder: "Entered twice, wrong amount…" },
        });
        if (!answer.confirmed) return;
        setPending(true);
        await deleteExpense(id, answer.reason);
        setPending(false);
        router.refresh();
      }}
      className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--red-soft)] hover:text-[var(--red-text)] disabled:opacity-50"
    >
      <Trash2 size={14} aria-hidden />
    </button>
  );
}
