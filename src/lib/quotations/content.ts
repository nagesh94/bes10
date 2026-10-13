/**
 * The fixed wording of a BHIM quotation.
 *
 * Transcribed from the quotations the office already sends, down to the
 * punctuation. A customer who has seen one of these before must not be able
 * to tell that this one came out of a computer, so nothing here is
 * "improved" — the odd spacing and the stray capital letters are the
 * original's and they stay.
 *
 * The only moving parts are the capacity, the consumer, the materials, the
 * price and the schedule. Everything in this file is the same on every
 * quotation, which is exactly why it is code and not eight rows of
 * boilerplate copied into the database per customer.
 */

export interface ScopeRow {
  key: string;
  section: string;
  details: string;
  byBhim: boolean;
  byCustomer: boolean;
}

/**
 * The Project Scope table.
 *
 * Plant performance monitoring is ticked in both columns on the original —
 * both parties watch the generation — and that is not a transcription slip.
 */
export const SCOPE_ROWS: readonly ScopeRow[] = [
  {
    key: "site-inspection",
    section: "Site Inspection",
    details:
      "Shadow Free Area in South Direction. Structure Height, Electrical Inspection, Earthing Position & Others.",
    byBhim: true,
    byCustomer: false,
  },
  {
    key: "approvals",
    section: "Approvals",
    details: "Discom & MNRE approval.",
    byBhim: true,
    byCustomer: false,
  },
  {
    key: "design",
    section: "Design",
    details: "Design for maximum energy Generation & Wind Speed.",
    byBhim: true,
    byCustomer: false,
  },
  {
    key: "installation",
    section: "Installation",
    details: "Installation of structure and PV module.",
    byBhim: true,
    byCustomer: false,
  },
  {
    key: "civil-work",
    section: "Civil Work",
    details: "Civil foundation for better strength.",
    byBhim: true,
    byCustomer: false,
  },
  {
    key: "commissioning",
    section: "Commissioning",
    details: "Solar Plant commissioning.",
    byBhim: true,
    byCustomer: false,
  },
  {
    key: "monitoring",
    section: "Plant Performance Monitoring",
    details: "Monitoring of Solar Plant generation.",
    byBhim: true,
    byCustomer: true,
  },
  {
    key: "services",
    section: "Services",
    details:
      "5 Years Services is under BHIM scope. The service cost is included in project cost.",
    byBhim: true,
    byCustomer: false,
  },
];

export const SCOPE_HEADER = ["SECTION", "DETAILS", "BHIM", "CUSTOMER"] as const;

export const SOLAR_ENERGY_PARAGRAPHS: readonly string[] = [
  "We are living in a modern world where we always try to save time as we know the value of time. For this, we prefer and believe on technology for saving our time and make our life more comfortable. We all need a peaceful, safe and healthy life. Here the solar energy can play a very important role for our healthy and better life. Each year, tons of fossil fuels are needed for the electricity generation which in turn harms our environment by increasing the CO2 level and pollution causes due to burning of fossil fuels.",
  "Solar energy the cleanest and most abundant form of energy present on this beautiful earth. Instead of using fossil fuels for the production of electricity, we can produce our own electricity with the help of solar energy. We should take the step for the cleaner environment and makes our family to live a pollution free and healthy life. Every kilowatt of solar plant can reduce up to 3000 pounds of CO2 every year.",
];

export const SOLAR_ENERGY_SOLUTIONS: readonly string[] = [
  "Proposed the solar plant capacity according to the Electricity Consumption.",
  "Site survey.",
  "Make design for solar plant without wasting the roof area / land area.",
  "Installation of Structure.",
  "Commissioning and Lessoning.",
  "Regularly monitoring of solar plant.",
];

export const ASSUMPTIONS: readonly string[] = [
  "The Customer wants to get rid from the Electricity Bill.",
  "The Customer wants to own the Green Energy, the leanest energy for their better future.",
  "The Solar Plant will be installed at single location only within their own Premises.",
  "The Customer will provide required shadow free Area for Solar Plant Installation.",
  "The Customer must have Permanent Connection Load.",
  "The output of Solar Power Plant will be connected to single meter only.",
];

/**
 * The three Project Summary bullets that follow the capacity line.
 *
 * The last one names the state's metering scheme, so it is parameterised —
 * it is the one sentence here that would be wrong outside Madhya Pradesh.
 */
export function summaryTail(stateName = "Madhya Pradesh"): string[] {
  return [
    "The Solar Plant would be in a direction of south facing and tilt angle between 12° to 16° depends on Latitude angle of respective place.",
    "The maximum shadow free area per KWP required is 180 Sq ft .",
    `The Solar Power Plant will be on grid system under Net/Smart Metering scheme of ${stateName} Government. This net/Smart meter will measure the solar electricity exported & imported from the grid.`,
  ];
}

export const MATERIAL_HEADER = [
  "Sr. No.",
  "Item Description",
  "Qty.",
  "Make",
  "Remark/Applicable Standards",
] as const;

export const NOTE_TEXT =
  "Due date of payment will be three days after receipt of invoice through mail/courier/hardcopy. Payment surcharge will be applicable after due date. Surcharge will be applicable @18% on day-on-day basis after due date. Check bounce charges will be extra against bank handling charges & company expanses. Any disputed related to project will be under Bhopal Juridical.";

export const EXCLUDED_TEXT =
  "Expenses related to Name change in Electricity Bill and Increase/Decrease of sanctioned load, if any. Provision for permanent stairs to access to the Rooftop, Water Pipelines & Pump to ensure availability of water at rooftop for periodic cleaning of Solar Panels. Cost of any material supply by the client subject to the matching of quality and price shared by BHIM ENERGY SOLUTIONS. Walkway, side railing, Water Pipelines & Pump to ensure availability of water at rooftop for periodic cleaning of Solar Panels. In case of additional impact on product price or price impact due to govt. department policy changes, BHIM & Client will discuss same & resolve issue after mutual discussion. Time schedule of work completion is subjected to Government approval received from concerned department.";

export const WARRANTY: readonly string[] = [
  "The Solar PV Module covers the below mentioned warranty from the date of invoice.",
  "90% performance at the end of 12th Year and",
  "80% performance at the end of 30th Year.",
  "10 Years of manufacturing defect. (*)",
  "The Solar Inverter warranty would be 07-10 years from the date of invoice. (*)",
  "We trust the above offer is in line with your requirement and we look forward to receiving your valuable order. In case you need any further clarifications.",
  "The company shall not be held liable for any claims arising from external factors or deliberate damage to the solar plant.",
];

export const TERMS_LINE =
  "*Terms and conditions applied: product warranty varies as per the brand";

// ── Defaults the form starts from ───────────────────────────────────────

export interface ItemDraft {
  description: string;
  qty: string;
  make: string;
  remark: string;
}

export interface MilestoneDraft {
  label: string;
  schedule: string;
}

/** The schedule on the original: 10 / 70 / 10 / 10. Editable per quotation. */
export const DEFAULT_MILESTONES: readonly MilestoneDraft[] = [
  { label: "Advance along with firm purchase order", schedule: "10%" },
  { label: "Before Structure, Civil Work & Wiring related Work", schedule: "70%" },
  { label: "After Panel & Inverter installation", schedule: "10%" },
  { label: "At the time of Net meter installation", schedule: "10%" },
];

export interface MaterialBasis {
  structureMake?: string | null;
  panelCompany?: string | null;
  panelModel?: string | null;
  panelWattPeak?: number | null;
  panelCount?: number | null;
  inverterMake?: string | null;
  systemType?: "ON_GRID" | "OFF_GRID" | "HYBRID";
}

/**
 * The array size the panel row states.
 *
 * It is not the headline capacity, and the difference is the point: six 540 W
 * modules on a "3 KWP" sanction is 3.24 kW of panel, and the original
 * quotation prints exactly that. Returns null when the panel is not yet
 * chosen, so the row falls back to the headline figure.
 */
export function arrayKw(wattPeak?: number | null, count?: number | null): number | null {
  if (!wattPeak || !count) return null;
  return Math.round(((wattPeak * count) / 1000) * 100) / 100;
}

const INVERTER_LABEL: Record<string, string> = {
  ON_GRID: "On Grid Inverter",
  OFF_GRID: "Off Grid Inverter",
  HYBRID: "Hybrid Inverter",
};

/**
 * The seven material rows a new quotation starts with.
 *
 * Everything the dropdowns know is merged in; the rest is the standard
 * wording. Staff edit any cell afterwards, and the edited rows — not these —
 * are what is stored and printed.
 */
export function defaultItems(basis: MaterialBasis, capacityKwp: number): ItemDraft[] {
  const panelKw = arrayKw(basis.panelWattPeak, basis.panelCount) ?? capacityKwp;
  const panelDescription = basis.panelWattPeak
    ? `Solar Panel ${basis.panelWattPeak}w Monocot Bifacial`
    : "Solar Panel Monocot Bifacial";

  return [
    {
      description: "Solar Structure",
      qty: "1 Set",
      make: basis.structureMake ? `${basis.structureMake} Galvanized Structure` : "",
      remark: "Design as per Site preference and wind Speed",
    },
    {
      description: basis.panelModel
        ? `${panelDescription} (${basis.panelModel})`
        : panelDescription,
      qty: `${panelKw} kw`,
      make: basis.panelCompany ?? "",
      remark:
        "90% Performance at the end of 12th Year and 80% performance at the end of 30th Year",
    },
    {
      description: INVERTER_LABEL[basis.systemType ?? "ON_GRID"] ?? "On Grid Inverter",
      qty: "1 No.",
      make: basis.inverterMake ?? "",
      remark: "The solar Inverter Warranty Would be 7 to 10 Years from the date of invoice.",
    },
    {
      description: "ACDB/DCDB",
      qty: "1 set",
      make: "Havells",
      remark: "As per State Electricity Board Guidelines.",
    },
    {
      description: "AC, DC (4sqmm cu) and Earthing Cable (4sqmm Cu)",
      qty: "In Meter",
      make: "POLYCAB",
      remark: "As per State Electricity Board Guidelines.",
    },
    {
      description: "LA & Earthing",
      qty: "1 set",
      make: "As per requirement",
      remark: "As per State Electricity Board Guidelines.",
    },
    {
      description: "Energy Meter",
      qty: "1 No.",
      make: "Secure (Bi Directional)",
      remark: "As per State Electricity Board Guidelines.",
    },
  ];
}

export const SYSTEM_TYPES = [
  { value: "ON_GRID", label: "On Grid-Tie", subject: "On Grid -Tie Solar System" },
  { value: "OFF_GRID", label: "Off Grid", subject: "Off Grid Solar System" },
  { value: "HYBRID", label: "Hybrid", subject: "Hybrid Solar System" },
] as const;

export type SystemType = (typeof SYSTEM_TYPES)[number]["value"];

export const DEFAULT_METERING_POLICY = "M.P. Net / Smart Metering Policy";

/**
 * "3KWP" — the capacity as the subject line writes it.
 *
 * Whole numbers lose the decimal, because the original says 3KWP and not
 * 3.00KWP, but a 4.5 kW job has to keep it.
 */
export function capacityWord(kwp: number | string): string {
  const n = typeof kwp === "string" ? Number(kwp) : kwp;
  if (!Number.isFinite(n)) return `${kwp}KWP`;
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}KWP`;
}

/** The subject line, which is the one sentence that states the whole offer. */
export function subjectLine(
  kwp: number | string,
  systemType: SystemType,
  meteringPolicy: string,
): string {
  const system =
    SYSTEM_TYPES.find((t) => t.value === systemType)?.subject ?? SYSTEM_TYPES[0].subject;
  return `Offer for Design, Installation, Erection, Procurement &commissioning (EPC) of ${capacityWord(kwp)} ${system} at your premises, under ${meteringPolicy}.`;
}

/**
 * "2,20,000" — lakh-crore grouping, which is what the original prints.
 *
 * Lives here rather than beside the PDF builder so a page can format an
 * amount without pulling in pdf-lib and sharp to do it.
 */
export function inr(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const whole = Math.trunc(Math.abs(rounded));
  const paise = Math.round((Math.abs(rounded) - whole) * 100);

  const digits = String(whole);
  // Last three digits, then pairs: 2,20,000 rather than 220,000.
  const head = digits.length > 3 ? digits.slice(0, -3) : "";
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}` : tail;

  const sign = rounded < 0 ? "-" : "";
  return paise ? `${sign}${grouped}.${String(paise).padStart(2, "0")}` : `${sign}${grouped}`;
}
