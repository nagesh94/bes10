export const MASTER_CATEGORIES = [
  { key: "panel-companies", label: "Panel companies", addLabel: "Add company" },
  { key: "panel-types", label: "Panel types", addLabel: "Add type" },
  { key: "panel-models", label: "Panel models", addLabel: "Add model" },
  { key: "suppliers", label: "Panel suppliers (DCR)", addLabel: "" },
  { key: "inverters", label: "Inverter models", addLabel: "Add inverter" },
  { key: "structures", label: "Structure companies", addLabel: "Add company" },
  { key: "cable-makes", label: "Cable makes", addLabel: "Add make" },
  { key: "banks", label: "Banks (customer accounts)", addLabel: "Add bank" },
  { key: "lenders", label: "Lenders (loans)", addLabel: "Add lender" },
  { key: "expense-categories", label: "Expense categories", addLabel: "Add category" },
  { key: "rate-card", label: "Rate card (costs)", addLabel: "" },
  { key: "discom", label: "DISCOM hierarchy", addLabel: "Add zone" },
  { key: "plant-sizes", label: "Plant sizes", addLabel: "Add size" },
] as const;

export type MasterCategory = (typeof MASTER_CATEGORIES)[number]["key"];

export function isMasterCategory(value: string): value is MasterCategory {
  return MASTER_CATEGORIES.some((c) => c.key === value);
}

export function masterCategory(value: string | undefined): MasterCategory {
  return value && isMasterCategory(value) ? value : "panel-models";
}
