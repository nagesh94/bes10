import type { SignatureImage, VendorIdentity } from "./docx-kit";

/**
 * Everything the generated documents read, assembled once.
 *
 * The four stage 7 documents overlap heavily — all of them want the consumer,
 * the capacity and the module details — so the action gathers this once and
 * each builder is a pure function of it. That also makes a builder testable
 * without a database, which matters: a wrong figure here reaches a government
 * portal.
 *
 * `money` is the exception and is deliberately nullable. Only the joint
 * inspection report states figures, and only because the DISCOM's own form
 * asks for all three. Every other document is built without it.
 */

export interface DocConsumer {
  /** "Mr." / "Mrs." — empty when gender was never recorded, never guessed. */
  title: string;
  name: string;
  address: string;
  pinCode: string | null;
  district: string | null;
  /** Printed on the commissioning certificate. */
  state: string | null;
  consumerNumber: string | null;
}

export interface DocDiscom {
  companyName: string;
  /** Madhya / Paschim / Poorv — the form prints one, not all three. */
  zoneWord: string | null;
  executiveEngineerLine: string | null;
  zoneName: string | null;
  circleName: string | null;
  divisionName: string | null;
  code: string | null;
}

export interface DocInstall {
  installationDate: string | null;
  panelCompany: string | null;
  panelModelNo: string | null;
  panelWattPeak: number | null;
  totalPanels: number | null;
  totalCapacityKw: string | null;
  inverterManufacturer: string | null;
  inverterBrand: string | null;
  inverterModelNo: string | null;
  inverterSerial: string | null;
  inverterCapacityKw: string | null;
  inverterCount: number | null;
  inverterPhase: "SINGLE" | "THREE" | null;
  isHybrid: boolean;
  acdbMake: string | null;
  acdbSizeType: string | null;
  acdbSpd: string | null;
  acdbMcb: string | null;
  dcdbMake: string | null;
  dcdbSizeType: string | null;
  dcdbSpd: string | null;
  dcdbMcb: string | null;
  purchaseOrderNo: string | null;
  purchaseOrderDate: string | null;
  cellManufacturer: string | null;
  cellGstInvoiceNo: string | null;
}

export interface DocMaterial {
  category: "AC" | "DC" | "LA" | "EARTHING";
  make: string | null;
  lengthM: string | null;
  sizeSqmm: string | null;
  coreType: string | null;
  conductor: string | null;
}

export interface DocEarthing {
  resistanceOhms: string | null;
  wireSize: string | null;
  wireType: string | null;
  twoSeparatePoints: boolean;
  cautionSignage: boolean;
  omManualProvided: boolean;
}

export interface DocBattery {
  manufacturer: string | null;
  batteryType: string | null;
  cellCapacity: string | null;
  seriesCount: number | null;
  parallelCount: number | null;
  totalCapacity: string | null;
  totalVoltage: string | null;
  serials: string[];
}

export interface DocMoney {
  totalProjectCost: number;
  subsidyAmount: number;
  paidByBeneficiary: number;
}

export interface DocContext {
  projectCode: string;
  consumer: DocConsumer;
  vendor: VendorIdentity;
  discom: DocDiscom;
  nationalPortalId: string | null;
  sanctionDate: string | null;
  install: DocInstall;
  panelSerials: string[];
  material: DocMaterial[];
  earthing: DocEarthing | null;
  battery: DocBattery | null;
  /** From the geotagged field photos, which is the only place we have it. */
  geo: { latitude: string; longitude: string } | null;
  /** Left blank on the form when unknown — the DISCOM fills these in. */
  dates: {
    commissioning: Date | null;
    jointInspection: Date | null;
    performanceCheck: Date | null;
  };
  /** Joint inspection report only. Null everywhere else. */
  money: DocMoney | null;
  /**
   * Signature images printed into the forms.
   *
   * The vendor's is a constant asset and is always present. The consumer's is
   * whatever was uploaded against CUSTOMER_SIGNATURE, so it is null until
   * someone collects it — the form then prints a blank line to sign instead,
   * which is how these were produced before.
   */
  signatures: { vendor: SignatureImage; consumer: SignatureImage };
}

/** "4.82 kWp" — the capacity string these forms repeat constantly. */
export function capacityKwp(ctx: DocContext): string {
  return ctx.install.totalCapacityKw ? `${ctx.install.totalCapacityKw} kWp` : "";
}

/**
 * The installation address.
 *
 * The forms are not consistent about the pin code — the joint inspection
 * report and the DCR undertaking include it, the work completion report's
 * signature block does not — so which one is wanted is passed in rather than
 * guessed.
 */
export function fullAddress(ctx: DocContext, withPin = true): string {
  return withPin
    ? [ctx.consumer.address, ctx.consumer.pinCode].filter(Boolean).join(", ")
    : ctx.consumer.address;
}

/** The address as the ALMM and DCR forms write it: "..., (M.P.) 460001". */
export function addressWithState(ctx: DocContext, state = "M.P."): string {
  return [ctx.consumer.address, `(${state})`, ctx.consumer.pinCode].filter(Boolean).join(" ");
}

/**
 * "Mrs. Krishni Nagde", or the bare name.
 *
 * The body text of every form uses the title; the signature blocks print the
 * name alone, which is why this takes a flag instead of always doing one.
 */
export function consumerWithTitle(ctx: DocContext, withTitle = true): string {
  return withTitle
    ? [ctx.consumer.title, ctx.consumer.name].filter(Boolean).join(" ").trim()
    : ctx.consumer.name;
}

/** The one wire run of a given kind, or null when it was never recorded. */
export function materialFor(
  ctx: DocContext,
  category: DocMaterial["category"],
): DocMaterial | null {
  return ctx.material.find((m) => m.category === category) ?? null;
}

/**
 * "4 sqmm, single core, copper" — the DISCOM's "Size & Type" line.
 *
 * Assembled here rather than stored as one string so each part can be edited
 * on its own in the form, but printed as one line because that is the single
 * field the paper asks for.
 */
export function sizeAndType(m: DocMaterial | null): string {
  if (!m) return "";
  return [m.sizeSqmm, m.coreType, m.conductor].filter(Boolean).join(", ");
}
