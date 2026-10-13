"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAgreement, updateAgreement } from "@/app/actions/agreements";
import {
  apportion,
  type AgreementFormValues,
  type AgreementMilestoneDraft,
} from "@/lib/agreements/form-values";
import { inr } from "@/lib/quotations/content";
import type { AgreementInput } from "@/lib/validation/agreement";

/**
 * The agreement maker.
 *
 * Short on purpose. Clauses 1 to 18 are MNRE boilerplate and identical on
 * every agreement the office has ever sent, so there is nothing to ask
 * about them — only the parties, the date and clause 19.1 change, and those
 * are what this form collects.
 *
 * The instalments are rupee figures rather than the quotation's "10%",
 * because that is how clause 19.1 reads on the paper. The running total
 * under the table is the whole reason it is laid out this way: a schedule
 * that does not add up to the figure in 19.1 is the one mistake in this
 * document a notary will send back.
 */

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[14.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const cell =
  "h-10 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const sectionBox =
  "mb-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5";

function Err({ name, errors }: { name: string; errors: Record<string, string[]> }) {
  const messages = errors[name];
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{messages[0]}</p>;
}

/** "2,20,000" and "Rs. 2 20 000" both reach the action as 220000. */
const digits = (value: string) => value.replace(/[^\d.]/g, "");

const SOURCE_NOTE: Record<string, string> = {
  plan: "Filled from the locked payment plan. Change it here if the agreement says something else — this form is what prints.",
  quotation:
    "Filled from the quotation this customer accepted; there is no locked payment plan yet. Change it here if a different figure was agreed.",
  typed:
    "Nothing to fill it from — no locked payment plan and no chosen quotation — so type what was agreed.",
};

export function AgreementForm({
  mode,
  agreementId,
  initial,
  projectCode,
}: {
  mode: "create" | "edit";
  agreementId?: string;
  initial: AgreementFormValues;
  projectCode?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<AgreementFormValues>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const set = <K extends keyof AgreementFormValues>(key: K, value: AgreementFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const total = Number(digits(values.totalValue)) || 0;
  const scheduled = values.milestones.reduce(
    (sum, m) => sum + (Number(digits(m.amount)) || 0),
    0,
  );
  const difference = total - scheduled;

  function updateMilestone(index: number, patch: Partial<AgreementMilestoneDraft>) {
    set(
      "milestones",
      values.milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    setErrors({});

    const payload = {
      projectId: values.projectId,
      consumerTitle: values.consumerTitle,
      consumerName: values.consumerName,
      consumerAddress: values.consumerAddress,
      executionDate: values.executionDate,
      totalValue: digits(values.totalValue),
      valueSource: values.valueSource,
      milestones: values.milestones.map((m) => ({
        label: m.label,
        amount: digits(m.amount) || "0",
      })),
    } as unknown as AgreementInput;

    const result =
      mode === "edit" && agreementId
        ? await updateAgreement(agreementId, payload)
        : await createAgreement(payload);

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      if (result.fieldErrors) setErrors(result.fieldErrors);
      return;
    }

    router.push(`/agreements/${result.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* ── The parties ── */}
      <section className={sectionBox}>
        <h2 className="mb-1 text-base font-bold">First party — the consumer</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          Printed in the opening recital and again in the signature block. The title is left off
          rather than guessed when it is not known.
        </p>

        <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
          <div>
            <label className={label} htmlFor="consumerTitle">
              Title
            </label>
            <select
              id="consumerTitle"
              className={field}
              value={values.consumerTitle}
              onChange={(e) =>
                set("consumerTitle", e.target.value as AgreementFormValues["consumerTitle"])
              }
            >
              <option value="">—</option>
              <option value="Mr.">Mr.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="M/s">M/s</option>
            </select>
          </div>

          <div>
            <label className={label} htmlFor="consumerName">
              Name
            </label>
            <input
              id="consumerName"
              className={field}
              value={values.consumerName}
              onChange={(e) => set("consumerName", e.target.value)}
            />
            <Err name="consumerName" errors={errors} />
          </div>
        </div>

        <div className="mt-4">
          <label className={label} htmlFor="consumerAddress">
            Address
          </label>
          <input
            id="consumerAddress"
            className={field}
            value={values.consumerAddress}
            onChange={(e) => set("consumerAddress", e.target.value)}
          />
          <Err name="consumerAddress" errors={errors} />
        </div>

        <div className="mt-4 max-w-56">
          <label className={label} htmlFor="executionDate">
            Date of execution
          </label>
          <input
            id="executionDate"
            type="date"
            className={`${field} ref`}
            value={values.executionDate}
            onChange={(e) => set("executionDate", e.target.value)}
          />
          <Err name="executionDate" errors={errors} />
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-[var(--muted)]">
          The second party — BHIM Energy Solutions and its registered office — is taken from the
          company branch record and printed as it stands today.
          {projectCode ? ` This agreement is attached to ${projectCode}.` : ""}
        </p>
      </section>

      {/* ── Clause 19.1 ── */}
      <section className={sectionBox}>
        <h2 className="mb-1 text-base font-bold">Clause 19.1 — the cost</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
          {SOURCE_NOTE[values.valueSource] ?? SOURCE_NOTE.typed}
        </p>

        <div className="max-w-72">
          <label className={label} htmlFor="totalValue">
            Cost of the RTS system (Rs.)
          </label>
          <input
            id="totalValue"
            inputMode="numeric"
            className={`${field} ref`}
            value={values.totalValue}
            onChange={(e) => {
              set("totalValue", e.target.value);
              // Typing a cost on a form that has never had one fills the
              // standard split, which is right far more often than four
              // blanks. Once a figure is in a row, it is left alone.
              if (values.milestones.every((m) => !digits(m.amount))) {
                const next = Number(digits(e.target.value)) || 0;
                if (next > 0) set("milestones", apportion(next));
              }
            }}
          />
          <Err name="totalValue" errors={errors} />
        </div>
      </section>

      {/* ── The instalments ── */}
      <section className={sectionBox}>
        <h2 className="mb-1 text-base font-bold">Clause 19.1 (i)(ii)(iii) — the instalments</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          Each one prints as a rupee figure with its share of the cost worked out beside it.
        </p>

        <div className="overflow-x-auto rounded-[9px] border border-[var(--line)]">
          <div className="grid min-w-[520px] grid-cols-[32px_2.4fr_1fr_64px_40px] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
            <span />
            {["What it is for", "Amount (Rs.)", "Share"].map((h) => (
              <span key={h} className="text-[12px] font-semibold text-[var(--muted)]">
                {h}
              </span>
            ))}
            <span />
          </div>

          {values.milestones.map((milestone, index) => {
            const amount = Number(digits(milestone.amount)) || 0;
            const percent = total > 0 ? Math.round((amount / total) * 100) : null;
            return (
              <div
                key={index}
                className="grid min-w-[520px] grid-cols-[32px_2.4fr_1fr_64px_40px] items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2.5"
              >
                <span className="ref flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--chip-soft)] text-[11.5px] font-bold text-[var(--chip-text)]">
                  {index + 1}
                </span>
                <input
                  aria-label={`Instalment ${index + 1} description`}
                  className={cell}
                  value={milestone.label}
                  onChange={(e) => updateMilestone(index, { label: e.target.value })}
                />
                <input
                  aria-label={`Instalment ${index + 1} amount`}
                  inputMode="numeric"
                  className={`${cell} ref`}
                  value={milestone.amount}
                  onChange={(e) => updateMilestone(index, { amount: e.target.value })}
                />
                <span className="ref text-[12.5px] font-semibold text-[var(--muted)]">
                  {percent === null ? "—" : `${percent}%`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove instalment ${index + 1}`}
                  onClick={() =>
                    set(
                      "milestones",
                      values.milestones.filter((_, i) => i !== index),
                    )
                  }
                  className="h-8 w-8 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => set("milestones", [...values.milestones, { label: "", amount: "" }])}
            className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--navy)]"
          >
            Add an instalment
          </button>
          <button
            type="button"
            disabled={total <= 0}
            onClick={() => set("milestones", apportion(total))}
            title="Replace the rows with the standard 10 / 70 / 10 / 10 split of the cost"
            className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use the standard split
          </button>

          {/* The one check worth making before this goes to a notary. */}
          <span
            className={`ref text-[12.5px] font-semibold ${
              total > 0 && difference !== 0 ? "text-[var(--red-text)]" : "text-[var(--muted)]"
            }`}
          >
            {total <= 0
              ? "No cost entered yet"
              : difference === 0
                ? `Adds up to Rs. ${inr(total)}`
                : difference > 0
                  ? `Rs. ${inr(difference)} short of the cost`
                  : `Rs. ${inr(-difference)} over the cost`}
          </span>
        </div>
        <Err name="milestones" errors={errors} />
      </section>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending
            ? "Generating…"
            : mode === "edit"
              ? "Save and rebuild the .docx"
              : "Generate agreement"}
        </button>
        <span className="text-[12.5px] text-[var(--muted)]">
          A Word file, not a PDF — the lawyer edits it to prepare the hard copy. The signed,
          notarised scan is uploaded separately and never replaces this one.
        </span>
      </div>
    </form>
  );
}
