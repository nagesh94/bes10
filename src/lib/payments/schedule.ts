/**
 * The vocabulary the money screens share.
 *
 * A schedule line is a trigger and an amount, so the trigger carries the
 * whole meaning of the line — which means its wording has to be the same on
 * the payment plan, on the agreement it prefills, and in the finance view.
 * Keeping the list here is what makes that true.
 */

export const SCHEDULE_TRIGGERS = [
  "UPFRONT",
  "ON_INSTALL",
  "PSS1",
  "PSS2",
  "POST_SUBSIDY",
  "ON_LOAN_DISBURSAL",
] as const;

export type ScheduleTrigger = (typeof SCHEDULE_TRIGGERS)[number];

/**
 * PSS1 and PSS2 are the bank's own names for the two parts a sanctioned loan
 * is released in — often 70:30, but that is the lender's call, so the labels
 * say what the tranche is and never what share it is.
 */
export const TRIGGER_LABELS: Record<ScheduleTrigger, string> = {
  UPFRONT: "Upfront",
  ON_INSTALL: "On install",
  PSS1: "PSS1 — first bank release",
  PSS2: "PSS2 — second bank release",
  POST_SUBSIDY: "After subsidy",
  ON_LOAN_DISBURSAL: "On loan disbursal",
};

/** The short form, for a table cell or a printed schedule. */
export const TRIGGER_SHORT: Record<ScheduleTrigger, string> = {
  UPFRONT: "Upfront",
  ON_INSTALL: "On install",
  PSS1: "PSS1",
  PSS2: "PSS2",
  POST_SUBSIDY: "After subsidy",
  ON_LOAN_DISBURSAL: "On loan disbursal",
};

export function isScheduleTrigger(value: string): value is ScheduleTrigger {
  return (SCHEDULE_TRIGGERS as readonly string[]).includes(value);
}

/**
 * How an amount moved. A disbursal arrives as one of the two tranches, so
 * those are the options offered; plain `LOAN_DISBURSAL` is kept only so rows
 * written before the split still render.
 */
export const RECEIVED_MODES = [
  "NEFT",
  "UPI",
  "CASH",
  "CHEQUE",
  "LOAN_DISBURSAL_PSS1",
  "LOAN_DISBURSAL_PSS2",
] as const;

export type ReceivedMode = (typeof RECEIVED_MODES)[number] | "LOAN_DISBURSAL";

export const RECEIVED_MODE_LABELS: Record<ReceivedMode, string> = {
  NEFT: "NEFT",
  UPI: "UPI",
  CASH: "Cash",
  CHEQUE: "Cheque",
  LOAN_DISBURSAL_PSS1: "Loan disbursal — PSS1",
  LOAN_DISBURSAL_PSS2: "Loan disbursal — PSS2",
  LOAN_DISBURSAL: "Loan disbursal",
};

/** Money going out to the customer never arrives as a bank tranche. */
export const PAID_OUT_MODES = ["NEFT", "UPI", "CASH", "CHEQUE"] as const;

export type PaidOutMode = (typeof PAID_OUT_MODES)[number];
