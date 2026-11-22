/**
 * How a dealer was paid for a cost-sheet line. Client-safe.
 *
 * Kept to the four the office actually uses; "Other" carries a note, so an
 * adjustment against dealer credit or a part-exchange is still explained.
 */
export const COST_PAYMENT_MODES = ["CASH", "UPI", "NET_BANKING", "OTHER"] as const;

export type CostPaymentMode = (typeof COST_PAYMENT_MODES)[number];

export const COST_PAYMENT_LABEL: Record<CostPaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  NET_BANKING: "Net banking",
  OTHER: "Other",
};

export function isCostPaymentMode(value: string): value is CostPaymentMode {
  return (COST_PAYMENT_MODES as readonly string[]).includes(value);
}
