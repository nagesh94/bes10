import { DEFAULT_MILESTONES, defaultItems, SCOPE_ROWS } from "./content";
import type { ItemDraft, MilestoneDraft, SystemType } from "./content";

/**
 * The shape of the quotation form, and the blank one.
 *
 * In its own module rather than beside the form component on purpose: a
 * plain value exported from a `"use client"` file is replaced by a client
 * reference when a server component imports it, so calling it on the server
 * fails at runtime with "not a function" — the same trap as exporting a
 * plain object from a `"use server"` file. The pages build the initial
 * values on the server, so this has to live outside the component.
 */

export interface PanelOption {
  company: string;
  modelNo: string;
  wattPeak: number;
}

export interface InverterOption {
  label: string;
  manufacturer: string;
  modelNo: string;
}

export interface MasterOptions {
  structures: string[];
  panels: PanelOption[];
  inverters: InverterOption[];
  plantSizes: Array<{ kw: string; label: string }>;
}

export interface QuotationFormValues {
  projectId: string;
  consumerTitle: "" | "Mr." | "Mrs." | "M/s";
  consumerName: string;
  consumerAddress: string;
  consumerPhone: string;
  quotationDate: string;
  capacityKwp: string;
  systemType: SystemType;
  meteringPolicy: string;
  totalAmount: string;
  structureMake: string;
  panelCompany: string;
  panelModel: string;
  panelWattPeak: string;
  panelCount: string;
  inverterMake: string;
  inverterModel: string;
  notes: string;
  items: ItemDraft[];
  milestones: MilestoneDraft[];
  scope: Array<{ key: string; byBhim: boolean; byCustomer: boolean }>;
}

/** A blank quotation, with the standard material rows and schedule in place. */
export function emptyQuotation(today: string): QuotationFormValues {
  return {
    projectId: "",
    consumerTitle: "",
    consumerName: "",
    consumerAddress: "",
    consumerPhone: "",
    quotationDate: today,
    capacityKwp: "",
    systemType: "ON_GRID",
    meteringPolicy: "M.P. Net / Smart Metering Policy",
    totalAmount: "",
    structureMake: "",
    panelCompany: "",
    panelModel: "",
    panelWattPeak: "",
    panelCount: "",
    inverterMake: "",
    inverterModel: "",
    notes: "",
    items: defaultItems({}, 0),
    milestones: [...DEFAULT_MILESTONES],
    scope: SCOPE_ROWS.map((r) => ({ key: r.key, byBhim: r.byBhim, byCustomer: r.byCustomer })),
  };
}
