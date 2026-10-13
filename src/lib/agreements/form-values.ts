/**
 * The shape of the agreement form, and the blank one.
 *
 * In its own module rather than beside the form component, for the same
 * reason `lib/quotations/form-values.ts` is: a plain value exported from a
 * `"use client"` file becomes a client reference when a server component
 * imports it, so calling it on the server fails at runtime. The pages build
 * the initial values on the server.
 */

/** Where the form's figures came from, so the page can say so honestly. */
export type ValueSource = "plan" | "quotation" | "typed";

export interface AgreementMilestoneDraft {
  label: string;
  /** Kept as a string while it is in the form; "2,20,000" is typed daily. */
  amount: string;
}

export interface AgreementFormValues {
  projectId: string;
  consumerTitle: "" | "Mr." | "Mrs." | "M/s";
  consumerName: string;
  consumerAddress: string;
  executionDate: string;
  totalValue: string;
  valueSource: ValueSource;
  milestones: AgreementMilestoneDraft[];
}

/**
 * The standard four instalments, as rupee figures rather than percentages.
 *
 * The same split the quotation offers (10 / 70 / 10 / 10), because the
 * agreement states in words what the quotation offered in a table and the
 * two should not disagree. Amounts are left blank: they are filled from the
 * plan or the quotation when either exists, and apportioned from the total
 * when neither does.
 */
export const DEFAULT_AGREEMENT_SCHEDULE: ReadonlyArray<{ label: string; share: number }> = [
  { label: "Advance along with firm purchase order", share: 0.1 },
  { label: "Before structure, civil work and wiring related work", share: 0.7 },
  { label: "After panel and inverter installation", share: 0.1 },
  { label: "At the time of net meter installation", share: 0.1 },
];

/**
 * The standard schedule apportioned over a total.
 *
 * Rounded to whole rupees, with the remainder pushed onto the largest line
 * rather than spread about: the instalments have to add up to the figure in
 * clause 19.1, and the 70% line is the one nobody reads a rupee off.
 */
export function apportion(total: number): AgreementMilestoneDraft[] {
  if (!Number.isFinite(total) || total <= 0) {
    return DEFAULT_AGREEMENT_SCHEDULE.map((m) => ({ label: m.label, amount: "" }));
  }

  const amounts = DEFAULT_AGREEMENT_SCHEDULE.map((m) => Math.round(total * m.share));
  const biggest = amounts.indexOf(Math.max(...amounts));
  const drift = total - amounts.reduce((sum, a) => sum + a, 0);
  amounts[biggest] = (amounts[biggest] ?? 0) + drift;

  return DEFAULT_AGREEMENT_SCHEDULE.map((m, i) => ({
    label: m.label,
    amount: String(amounts[i] ?? 0),
  }));
}

/** A blank agreement, dated today, with the standard schedule in place. */
export function emptyAgreement(today: string): AgreementFormValues {
  return {
    projectId: "",
    consumerTitle: "",
    consumerName: "",
    consumerAddress: "",
    executionDate: today,
    totalValue: "",
    valueSource: "typed",
    milestones: DEFAULT_AGREEMENT_SCHEDULE.map((m) => ({ label: m.label, amount: "" })),
  };
}
