/**
 * Lender types, shared by the loan form, the loans tab and master data.
 *
 * Client-safe: no database import, so a form can group its dropdown with it.
 */

export const LENDER_KINDS = ["PUBLIC_BANK", "PRIVATE_BANK", "OTHER_BANK", "THIRD_PARTY"] as const;

export type LenderKind = (typeof LENDER_KINDS)[number];

export const LENDER_KIND_LABEL: Record<LenderKind, string> = {
  PUBLIC_BANK: "Public sector bank",
  PRIVATE_BANK: "Private bank",
  OTHER_BANK: "Gramin, co-operative or small finance bank",
  THIRD_PARTY: "Third-party finance (NBFC)",
};

/** Short form for a badge or a table cell. */
export const LENDER_KIND_SHORT: Record<LenderKind, string> = {
  PUBLIC_BANK: "Public bank",
  PRIVATE_BANK: "Private bank",
  OTHER_BANK: "Other bank",
  THIRD_PARTY: "Third party",
};

export function isLenderKind(value: string): value is LenderKind {
  return (LENDER_KINDS as readonly string[]).includes(value);
}

/** Banks go through Jan Samarth; a third-party lender is applied to directly. */
export function viaJanSamarth(kind: LenderKind | null | undefined): boolean {
  return kind !== "THIRD_PARTY";
}

export interface LenderOption {
  id: number;
  name: string;
  kind: LenderKind;
}
