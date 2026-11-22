/**
 * The pre-installation cost estimator.
 *
 * Pure and client-safe: the page recalculates on every keystroke, the server
 * recalculates on save, and both get the same answer because both call this.
 * Nothing here touches the database — rates come in as a plain map from the
 * rate card, and an estimate never becomes an expense or a cost sheet. It
 * exists to arrive at a price worth quoting.
 *
 * Every line is a quantity times a rate, both proposed from the inputs and
 * both overridable. The engineering behind the proposals — cable size from
 * current and voltage drop, battery bank from the load and how deep each
 * chemistry may be discharged — is spelled out on each line, so the office
 * can see why a number is what it is.
 */

export const SYSTEM_TYPES = ["ON_GRID", "HYBRID", "OFF_GRID"] as const;
export type SystemType = (typeof SYSTEM_TYPES)[number];

export const SYSTEM_TYPE_LABEL: Record<SystemType, string> = {
  ON_GRID: "On-grid",
  HYBRID: "Hybrid",
  OFF_GRID: "Off-grid",
};

export const SYSTEM_TYPE_BLURB: Record<SystemType, string> = {
  ON_GRID: "Grid-tied with net metering. No battery. Subsidy for residential with DCR panels.",
  HYBRID: "Grid-tied with battery backup. Subsidy for residential with DCR panels.",
  OFF_GRID: "Battery only, no grid export. No PM Surya Ghar subsidy.",
};

export type BatteryChemistry = "LEAD_ACID" | "LITHIUM";
export type CableChoice = "AUTO" | "FLEX" | "ARMOURED";

/** One thing that must keep running in a power cut. */
export interface Appliance {
  name: string;
  watts: number;
  qty: number;
  /** Hours it runs during the outage being planned for. */
  hours: number;
  /** Share of the time it actually draws power — a fridge cycles, ~0.5. */
  duty: number;
}

export const APPLIANCE_CATEGORIES = [
  "Lighting",
  "Fans & cooling",
  "Air conditioning",
  "Kitchen",
  "Water & heating",
  "Laundry & cleaning",
  "Entertainment & office",
  "Heavy & motors",
  "EV charging",
] as const;
export type ApplianceCategory = (typeof APPLIANCE_CATEGORIES)[number];

/**
 * Typical ratings, from BEE tables, manufacturer nameplates and Indian
 * consumer guides. Every figure is a starting point the office can change.
 * `duty` is the share of the time an appliance actually draws power while
 * it is "on" — a fridge compressor cycles, a lift only moves between floors.
 */
export const APPLIANCE_LIBRARY: Array<Appliance & { category: ApplianceCategory }> = [
  // Lighting
  { category: "Lighting", name: "LED bulb", watts: 9, qty: 1, hours: 4, duty: 1 },
  { category: "Lighting", name: "LED tube light", watts: 20, qty: 1, hours: 4, duty: 1 },
  { category: "Lighting", name: "LED panel / downlight", watts: 15, qty: 1, hours: 4, duty: 1 },
  { category: "Lighting", name: "Outdoor / flood light", watts: 50, qty: 1, hours: 6, duty: 1 },
  { category: "Lighting", name: "Decorative / strip lighting", watts: 30, qty: 1, hours: 4, duty: 1 },
  // Fans & cooling
  { category: "Fans & cooling", name: "Ceiling fan", watts: 75, qty: 1, hours: 4, duty: 1 },
  { category: "Fans & cooling", name: "BLDC ceiling fan", watts: 30, qty: 1, hours: 4, duty: 1 },
  { category: "Fans & cooling", name: "Table / pedestal fan", watts: 55, qty: 1, hours: 4, duty: 1 },
  { category: "Fans & cooling", name: "Exhaust fan", watts: 40, qty: 1, hours: 2, duty: 1 },
  { category: "Fans & cooling", name: "Air cooler (personal)", watts: 150, qty: 1, hours: 4, duty: 1 },
  { category: "Fans & cooling", name: "Air cooler (desert)", watts: 250, qty: 1, hours: 4, duty: 1 },
  // Air conditioning
  { category: "Air conditioning", name: "AC 1 ton (inverter)", watts: 1000, qty: 1, hours: 3, duty: 0.7 },
  { category: "Air conditioning", name: "AC 1.5 ton (inverter)", watts: 1500, qty: 1, hours: 3, duty: 0.7 },
  { category: "Air conditioning", name: "AC 2 ton (inverter)", watts: 2000, qty: 1, hours: 3, duty: 0.7 },
  { category: "Air conditioning", name: "AC 1.5 ton (non-inverter)", watts: 1800, qty: 1, hours: 3, duty: 0.85 },
  // Kitchen
  { category: "Kitchen", name: "Refrigerator", watts: 150, qty: 1, hours: 4, duty: 0.5 },
  { category: "Kitchen", name: "Double-door refrigerator", watts: 250, qty: 1, hours: 4, duty: 0.5 },
  { category: "Kitchen", name: "Deep freezer", watts: 300, qty: 1, hours: 4, duty: 0.5 },
  { category: "Kitchen", name: "Mixer grinder", watts: 500, qty: 1, hours: 0.25, duty: 1 },
  { category: "Kitchen", name: "Microwave oven", watts: 1200, qty: 1, hours: 0.25, duty: 1 },
  { category: "Kitchen", name: "OTG oven", watts: 1500, qty: 1, hours: 0.5, duty: 0.8 },
  { category: "Kitchen", name: "Induction cooktop", watts: 1800, qty: 1, hours: 0.5, duty: 0.8 },
  { category: "Kitchen", name: "Electric kettle", watts: 1500, qty: 1, hours: 0.1, duty: 1 },
  { category: "Kitchen", name: "Toaster", watts: 800, qty: 1, hours: 0.1, duty: 1 },
  { category: "Kitchen", name: "Kitchen chimney", watts: 200, qty: 1, hours: 1, duty: 1 },
  { category: "Kitchen", name: "Dishwasher", watts: 1800, qty: 1, hours: 1, duty: 0.6 },
  { category: "Kitchen", name: "RO water purifier", watts: 60, qty: 1, hours: 1, duty: 1 },
  // Water & heating
  { category: "Water & heating", name: "Geyser (storage)", watts: 2000, qty: 1, hours: 0.5, duty: 1 },
  { category: "Water & heating", name: "Instant geyser", watts: 3000, qty: 1, hours: 0.25, duty: 1 },
  { category: "Water & heating", name: "Room heater", watts: 2000, qty: 1, hours: 2, duty: 0.7 },
  { category: "Water & heating", name: "Water pump (0.5 HP)", watts: 375, qty: 1, hours: 0.5, duty: 1 },
  { category: "Water & heating", name: "Water pump (1 HP)", watts: 750, qty: 1, hours: 0.5, duty: 1 },
  { category: "Water & heating", name: "Submersible pump (1.5 HP)", watts: 1100, qty: 1, hours: 1, duty: 1 },
  { category: "Water & heating", name: "Pressure booster pump", watts: 370, qty: 1, hours: 0.5, duty: 0.5 },
  // Laundry & cleaning
  { category: "Laundry & cleaning", name: "Washing machine", watts: 500, qty: 1, hours: 1, duty: 0.6 },
  { category: "Laundry & cleaning", name: "Washing machine with heater", watts: 2000, qty: 1, hours: 1, duty: 0.5 },
  { category: "Laundry & cleaning", name: "Clothes iron", watts: 1000, qty: 1, hours: 0.5, duty: 0.6 },
  { category: "Laundry & cleaning", name: "Vacuum cleaner", watts: 1200, qty: 1, hours: 0.25, duty: 1 },
  { category: "Laundry & cleaning", name: "Hair dryer", watts: 1200, qty: 1, hours: 0.1, duty: 1 },
  // Entertainment & office
  { category: "Entertainment & office", name: "LED TV", watts: 100, qty: 1, hours: 3, duty: 1 },
  { category: "Entertainment & office", name: "Set-top box", watts: 15, qty: 1, hours: 3, duty: 1 },
  { category: "Entertainment & office", name: "Wi-Fi router", watts: 10, qty: 1, hours: 4, duty: 1 },
  { category: "Entertainment & office", name: "Laptop", watts: 65, qty: 1, hours: 3, duty: 1 },
  { category: "Entertainment & office", name: "Desktop computer", watts: 200, qty: 1, hours: 3, duty: 1 },
  { category: "Entertainment & office", name: "Printer", watts: 50, qty: 1, hours: 0.5, duty: 1 },
  { category: "Entertainment & office", name: "CCTV system (4 cameras)", watts: 40, qty: 1, hours: 4, duty: 1 },
  { category: "Entertainment & office", name: "Phone charger", watts: 15, qty: 1, hours: 2, duty: 1 },
  { category: "Entertainment & office", name: "Music system", watts: 100, qty: 1, hours: 2, duty: 1 },
  // Heavy & motors
  { category: "Heavy & motors", name: "Home lift (single-phase)", watts: 2200, qty: 1, hours: 1, duty: 0.15 },
  { category: "Heavy & motors", name: "Lift (3-phase, 3.7 kW)", watts: 3700, qty: 1, hours: 1, duty: 0.15 },
  { category: "Heavy & motors", name: "Gate motor", watts: 400, qty: 1, hours: 0.1, duty: 1 },
  { category: "Heavy & motors", name: "Air compressor", watts: 1500, qty: 1, hours: 0.5, duty: 0.5 },
  { category: "Heavy & motors", name: "Welding machine (small)", watts: 3000, qty: 1, hours: 0.5, duty: 0.5 },
  { category: "Heavy & motors", name: "Flour mill (atta chakki)", watts: 1500, qty: 1, hours: 0.5, duty: 1 },
  // EV charging
  { category: "EV charging", name: "E-cycle charger", watts: 250, qty: 1, hours: 3, duty: 1 },
  { category: "EV charging", name: "E-scooter charger (portable)", watts: 750, qty: 1, hours: 4, duty: 1 },
  { category: "EV charging", name: "E-scooter fast charger", watts: 1500, qty: 1, hours: 2, duty: 1 },
  { category: "EV charging", name: "E-rickshaw charger", watts: 1200, qty: 1, hours: 6, duty: 1 },
  { category: "EV charging", name: "EV car — portable 3.3 kW (15 A)", watts: 3300, qty: 1, hours: 4, duty: 1 },
  { category: "EV charging", name: "EV car — wallbox 7.4 kW (single-phase)", watts: 7400, qty: 1, hours: 3, duty: 1 },
  { category: "EV charging", name: "EV car — wallbox 11 kW (3-phase)", watts: 11000, qty: 1, hours: 2, duty: 1 },
];

const lib = (name: string, qty: number, hours?: number): Appliance => {
  const { category: _category, ...a } = APPLIANCE_LIBRARY.find((x) => x.name === name)!;
  return { ...a, qty, hours: hours ?? a.hours };
};

/** Starting points for someone who does not know what a home needs. */
export const LOAD_PRESETS: Array<{ key: string; label: string; appliances: Appliance[] }> = [
  {
    key: "essentials",
    label: "Essentials — lights, fans, TV, Wi-Fi",
    appliances: [lib("LED bulb", 6), lib("Ceiling fan", 3), lib("LED TV", 1), lib("Wi-Fi router", 1)],
  },
  {
    key: "essentials-fridge",
    label: "Essentials + fridge",
    appliances: [lib("LED bulb", 6), lib("Ceiling fan", 3), lib("LED TV", 1), lib("Wi-Fi router", 1), lib("Refrigerator", 1)],
  },
  {
    key: "home",
    label: "Whole home, no AC",
    appliances: [
      lib("LED bulb", 8),
      lib("Ceiling fan", 4),
      lib("LED TV", 1),
      lib("Wi-Fi router", 1),
      lib("Refrigerator", 1),
      lib("Laptop", 1),
      lib("Water pump (1 HP)", 1),
      lib("Mixer grinder", 1),
      lib("Washing machine", 1),
    ],
  },
  {
    key: "home-ac",
    label: "Whole home with one AC",
    appliances: [
      lib("LED bulb", 8),
      lib("Ceiling fan", 4),
      lib("LED TV", 1),
      lib("Wi-Fi router", 1),
      lib("Refrigerator", 1),
      lib("Water pump (1 HP)", 1),
      lib("AC 1.5 ton (inverter)", 1),
    ],
  },
  {
    key: "home-lift",
    label: "Home with lift",
    appliances: [
      lib("LED bulb", 10),
      lib("Ceiling fan", 5),
      lib("LED TV", 1),
      lib("Wi-Fi router", 1),
      lib("Double-door refrigerator", 1),
      lib("Water pump (1 HP)", 1),
      lib("Home lift (single-phase)", 1),
    ],
  },
  {
    key: "ev",
    label: "Essentials + EV charging",
    appliances: [
      lib("LED bulb", 6),
      lib("Ceiling fan", 3),
      lib("Wi-Fi router", 1),
      lib("Refrigerator", 1),
      lib("E-scooter charger (portable)", 1),
      lib("EV car — portable 3.3 kW (15 A)", 1),
    ],
  },
];

export type Segment = "RESIDENTIAL" | "COMMERCIAL";

export interface EstimateInputs {
  systemType: SystemType;
  /** Commercial is never subsidised and is built with non-DCR panels. */
  segment: Segment;
  /** Residential only: is the customer applying for PM Surya Ghar? */
  optSubsidy: boolean;
  capacityKw: number;
  phase: "SINGLE" | "THREE";
  panelWp: number;
  /** Blank means "work it out from capacity and watt-peak". */
  panelCount?: number | null;
  dcr: boolean;

  // Battery — hybrid and off-grid only.
  chemistry: BatteryChemistry;
  /** SIMPLE: one load for so many hours. APPLIANCES: the list below. */
  loadMode: "SIMPLE" | "APPLIANCES";
  backupLoadKw: number;
  backupHours: number;
  appliances: Appliance[];
  /** 150 or 200 for tubular. */
  leadAcidAh: number;
  /** Lithium pack capacity at the bank voltage: 100, 150, 200 Ah. */
  lithiumAh: number;

  // Distances on site, for cable and pipe.
  roofToInverterM: number;
  inverterToMeterM: number;
  earthingRunM: number;
  laRunM: number;
  /** AUTO: flexible for single-phase, armoured for three-phase. */
  acCable: CableChoice;

  // Pricing.
  marginPct: number;
  gstPct: number;
  /** Rupees per unit, for the payback figure. */
  tariff: number;
  /** kWh per kWp per day; 4.2 is Madhya Pradesh's annual average. */
  yieldPerKwDay: number;

  /** Per-line changes: { INVERTER: { quantity: 1, rate: 52000 } }. */
  overrides: Record<string, { quantity?: number; rate?: number; label?: string }>;
  /** Removed proposed lines, by code. */
  removed: string[];
  /** Lines added by hand. */
  extras: Array<{ label: string; quantity: number; unit: string; rate: number }>;
}

export const DEFAULT_INPUTS: EstimateInputs = {
  systemType: "ON_GRID",
  segment: "RESIDENTIAL",
  optSubsidy: true,
  capacityKw: 3,
  phase: "SINGLE",
  panelWp: 550,
  panelCount: null,
  dcr: true,
  chemistry: "LITHIUM",
  loadMode: "APPLIANCES",
  backupLoadKw: 1,
  backupHours: 4,
  appliances: LOAD_PRESETS[1]!.appliances,
  leadAcidAh: 150,
  lithiumAh: 100,
  roofToInverterM: 20,
  inverterToMeterM: 15,
  earthingRunM: 30,
  laRunM: 20,
  acCable: "AUTO",
  marginPct: 18,
  // Rooftop solar is a composite supply billed 70:30 — 5% on the goods,
  // 18% on the service — which works out to an effective 8.9%.
  gstPct: 8.9,
  tariff: 7,
  yieldPerKwDay: 4.2,
  overrides: {},
  removed: [],
  extras: [],
};

export const LINE_GROUPS = ["Modules", "Inverter", "Battery bank", "Cables & protection", "Structure", "Site & services"] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];

export interface EstimateLine {
  code: string;
  group: LineGroup;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  /** How the proposed quantity was arrived at. */
  basis: string;
  /** True when quantity or rate was changed by hand. */
  edited: boolean;
}

export interface BatteryOption {
  chemistry: BatteryChemistry;
  ah: number;
  /** Units in the bank — 12 V blocks for tubular, packs for lithium. */
  units: number;
  series: number;
  strings: number;
  unitLabel: string;
  rateCode: string;
  unitPrice: number;
  price: number;
  installedKwh: number;
  usableKwh: number;
  /** Hours the bank runs the planned load to its limit. */
  coversHours: number;
}

export interface BatteryPlan {
  /** Energy the loads use in the outage, at the appliance. */
  loadKwh: number;
  /** What the bank must hold after inverter losses. */
  neededKwh: number;
  peakKw: number;
  systemVoltage: number;
  /** Rough load in kW the hours are spread over, for "hours of backup". */
  averageKw: number;
  options: BatteryOption[];
  chosen: BatteryOption;
  inverterTooSmall: boolean;
}

export interface EstimateResult {
  lines: EstimateLine[];
  panelCount: number;
  dcCapacityKw: number;
  battery: BatteryPlan | null;
  cable: { dcSqmm: number; ac: AcCable };
  cost: number;
  costPerWatt: number;
  byGroup: Array<{ group: LineGroup; amount: number }>;
  /** Before GST, rounded to a sensible quoting figure. */
  quoteBeforeGst: number;
  gst: number;
  quoteWithGst: number;
  margin: number;
  subsidy: number;
  /** Why there is no subsidy, when there is none. */
  noSubsidyReason: string | null;
  /** The panel type actually priced — forced by segment and subsidy. */
  dcr: boolean;
  dcrLocked: string | null;
  customerPays: number;
  annualKwh: number;
  annualSavings: number;
  paybackYears: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pos = (n: unknown, fallback = 0) => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const inrShort = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** "3" → "3", "3.5" → "3_5": rate-card codes cannot hold a dot. */
const codeNum = (n: number) => String(round2(n)).replace(".", "_");

/**
 * PM Surya Ghar central financial assistance for a residential system:
 * ₹30,000/kW for the first 2 kW, ₹18,000 for the third, capped at ₹78,000.
 * Only for grid-connected systems with DCR panels.
 */
export function pmSuryaGharSubsidy(kw: number, type: SystemType, dcr: boolean) {
  if (type === "OFF_GRID" || !dcr || kw <= 0) return 0;
  const first = Math.min(kw, 2) * 30000;
  const third = Math.min(Math.max(kw - 2, 0), 1) * 18000;
  return Math.min(Math.round(first + third), 78000);
}

/**
 * Which panels a job uses and whether subsidy applies, from the choices that
 * decide it. PM Surya Ghar is for residential, grid-connected systems with
 * DCR panels whose owner applies; anything else is quoted without it.
 */
export function subsidyRules(i: Pick<EstimateInputs, "segment" | "optSubsidy" | "dcr" | "systemType">) {
  const commercial = i.segment === "COMMERCIAL";
  const opting = !commercial && i.optSubsidy;
  // Commercial jobs use non-DCR panels; a subsidised job must use DCR.
  const dcr = commercial ? false : opting ? true : i.dcr;
  const dcrLocked: string | null = commercial
    ? "Commercial jobs use non-DCR panels"
    : opting
      ? "DCR panels are required for the subsidy"
      : null;
  const eligible = opting && dcr && i.systemType !== "OFF_GRID";
  const reason = commercial
    ? "commercial — not eligible for subsidy"
    : !i.optSubsidy
      ? "customer is not opting for subsidy"
      : i.systemType === "OFF_GRID"
        ? "off-grid — not eligible for subsidy"
        : null;
  return { dcr, dcrLocked, eligible, reason };
}

/** Battery bank voltage an inverter of this size expects. */
export function systemVoltage(kw: number) {
  if (kw <= 1) return 12;
  if (kw <= 2) return 24;
  return 48;
}

/** LFP pack voltage for a bank voltage: 12 → 12.8, 24 → 25.6, 48 → 51.2. */
export const lithiumPackVoltage = (bankV: number) => round2((bankV / 12) * 12.8);

/** Installation labour is charged per watt on whole kilowatts: 3.6 kW → 3 kW. */
export function chargeableWatts(kw: number) {
  return Math.max(Math.floor(kw), kw > 0 ? 1 : 0) * 1000;
}

// ── Cable sizing ──────────────────────────────────────────────────────────

/** Copper resistivity, Ω·mm²/m, at operating temperature. */
const RHO = 0.0225;
/** Current a cable carries continuously, by type and size (A). */
const AMPACITY: Record<string, Record<number, number>> = {
  FLEX: { 4: 32, 6: 41, 10: 57 },
  ARMOURED_2C: { 6: 47, 10: 63 },
  ARMOURED_4C: { 6: 40, 10: 54, 16: 70 },
};

export interface AcCable {
  armoured: boolean;
  cores: 2 | 4;
  sqmm: number;
  currentA: number;
  dropPct: number;
  code: string;
  label: string;
}

/**
 * The smallest AC cable that carries the inverter's current with 25%
 * headroom and loses no more than 2% of the voltage over the run.
 */
export function sizeAcCable(kw: number, phase: "SINGLE" | "THREE", runM: number, choice: CableChoice): AcCable {
  const three = phase === "THREE";
  const armoured = choice === "ARMOURED" || (choice === "AUTO" && three);
  const cores = three ? 4 : 2;
  const table = armoured ? (three ? AMPACITY.ARMOURED_4C! : AMPACITY.ARMOURED_2C!) : AMPACITY.FLEX!;
  const currentA = round2(three ? (kw * 1000) / (Math.sqrt(3) * 415) : (kw * 1000) / 230);
  const drop = (sqmm: number) =>
    three
      ? (Math.sqrt(3) * runM * currentA * RHO) / sqmm / 415 * 100
      : (2 * runM * currentA * RHO) / sqmm / 230 * 100;
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const sqmm = sizes.find((s) => table[s]! >= currentA * 1.25 && drop(s) <= 2) ?? sizes[sizes.length - 1]!;
  return {
    armoured,
    cores: cores as 2 | 4,
    sqmm,
    currentA,
    dropPct: round2(drop(sqmm)),
    code: `AC_${armoured ? "ARM" : "FLEX"}_${cores}C_${sqmm}`,
    label: `${armoured ? "Armoured" : "AC flexible"} cable ${cores}-core ${sqmm} sq mm copper`,
  };
}

/** 4 sq mm suits most homes up to 5 kW; longer runs and bigger arrays want 6. */
export function sizeDcCable(kw: number, runM: number) {
  return kw > 5 || runM > 30 ? 6 : 4;
}

// ── Battery sizing ────────────────────────────────────────────────────────

/** Share of a battery's capacity that may be used without shortening its life. */
const DOD: Record<BatteryChemistry, number> = { LEAD_ACID: 0.5, LITHIUM: 0.9 };
/** Inverter losses between the battery and the sockets. */
const INVERTER_EFFICIENCY = 0.9;

export function planBattery(
  i: Pick<EstimateInputs, "loadMode" | "backupLoadKw" | "backupHours" | "appliances" | "capacityKw" | "chemistry" | "leadAcidAh" | "lithiumAh">,
  rates: Record<string, number>,
): BatteryPlan {
  const appliances = (i.appliances ?? []).filter((a) => a.qty > 0 && a.watts > 0);
  const simple = i.loadMode === "SIMPLE" || appliances.length === 0;
  const loadWh = simple
    ? pos(i.backupLoadKw) * 1000 * pos(i.backupHours)
    : appliances.reduce((s, a) => s + a.qty * a.watts * pos(a.hours) * Math.min(Math.max(pos(a.duty, 1), 0.05), 1), 0);
  const peakW = simple ? pos(i.backupLoadKw) * 1000 : appliances.reduce((s, a) => s + a.qty * a.watts, 0);
  const hours = simple ? pos(i.backupHours) : Math.max(...appliances.map((a) => pos(a.hours)), 0);
  const neededKwh = round2(loadWh / INVERTER_EFFICIENCY / 1000);
  const volts = systemVoltage(pos(i.capacityKw));
  const averageKw = hours > 0 ? loadWh / hours / 1000 : 0;

  const leadOption = (ah: number): BatteryOption => {
    const series = volts / 12;
    const usablePerString = (volts * ah * DOD.LEAD_ACID) / 1000;
    const strings = Math.max(1, Math.ceil(neededKwh / usablePerString));
    const units = series * strings;
    const rateCode = `BATTERY_LEAD_ACID_${ah}AH`;
    const unitPrice = rateCode in rates ? rates[rateCode]! : (rates.BATTERY_LEAD_ACID_150AH ?? 0) * (ah / 150);
    const usable = strings * usablePerString;
    return {
      chemistry: "LEAD_ACID",
      ah,
      units,
      series,
      strings,
      unitLabel: `12 V ${ah} Ah tubular`,
      rateCode,
      unitPrice: round2(unitPrice),
      price: round2(units * unitPrice),
      installedKwh: round2((units * 12 * ah) / 1000),
      usableKwh: round2(usable),
      coversHours: averageKw > 0 ? round2((usable * INVERTER_EFFICIENCY) / averageKw) : 0,
    };
  };

  const lithiumOption = (ah: number): BatteryOption => {
    const packV = lithiumPackVoltage(volts);
    const packKwh = (packV * ah) / 1000;
    const packs = Math.max(1, Math.ceil(neededKwh / (packKwh * DOD.LITHIUM)));
    const rateCode = `BATTERY_LITHIUM_${codeNum(packV)}V_${ah}AH`;
    const unitPrice = rateCode in rates ? rates[rateCode]! : (rates.BATTERY_LITHIUM_KWH ?? 0) * packKwh;
    const usable = packs * packKwh * DOD.LITHIUM;
    return {
      chemistry: "LITHIUM",
      ah,
      units: packs,
      series: 1,
      strings: packs,
      unitLabel: `${packV} V ${ah} Ah LFP`,
      rateCode,
      unitPrice: round2(unitPrice),
      price: round2(packs * unitPrice),
      installedKwh: round2(packs * packKwh),
      usableKwh: round2(usable),
      coversHours: averageKw > 0 ? round2((usable * INVERTER_EFFICIENCY) / averageKw) : 0,
    };
  };

  const options = [leadOption(150), leadOption(200), lithiumOption(100), lithiumOption(200)];
  const chosen =
    i.chemistry === "LEAD_ACID" ? leadOption(pos(i.leadAcidAh, 150) || 150) : lithiumOption(pos(i.lithiumAh, 100) || 100);

  return {
    loadKwh: round2(loadWh / 1000),
    neededKwh,
    peakKw: round2(peakW / 1000),
    systemVoltage: volts,
    averageKw: round2(averageKw),
    options,
    chosen,
    // A surge-free inverter should carry the whole running load.
    inverterTooSmall: peakW / 1000 > pos(i.capacityKw),
  };
}

/** A price worth putting on paper: up to the next ₹500. */
const quoteRound = (n: number) => Math.ceil(n / 500) * 500;

export function calculateEstimate(
  raw: Partial<EstimateInputs>,
  rates: Record<string, number>,
): EstimateResult {
  const merged: EstimateInputs = { ...DEFAULT_INPUTS, ...raw };
  const rules = subsidyRules(merged);
  const i: EstimateInputs = { ...merged, dcr: rules.dcr };
  const kw = pos(i.capacityKw);
  const wp = pos(i.panelWp, 550) || 550;
  const rate = (code: string, fallback = 0) => (code in rates ? rates[code]! : fallback);

  const panelCount = i.panelCount && i.panelCount > 0 ? Math.round(i.panelCount) : Math.ceil((kw * 1000) / wp);
  const dcKw = round2((panelCount * wp) / 1000);
  const hasBattery = i.systemType !== "ON_GRID";
  const gridTied = i.systemType !== "OFF_GRID";

  const proposed: Omit<EstimateLine, "amount" | "edited">[] = [];
  const add = (l: Omit<EstimateLine, "amount" | "edited">) => proposed.push(l);

  // ── Modules ──
  add({
    code: "PANEL",
    group: "Modules",
    label: `Solar panels ${wp} Wp${i.dcr ? " (DCR)" : ""}`,
    quantity: panelCount * wp,
    unit: "W",
    rate: rate(i.dcr ? "PANEL" : "PANEL_NON_DCR", rate("PANEL")),
    basis: `${panelCount} × ${wp} Wp = ${dcKw} kWp`,
  });

  // ── Inverter: by size from the card, else per kW ──
  {
    const base = i.systemType === "ON_GRID" ? "INVERTER" : i.systemType === "HYBRID" ? "INVERTER_HYBRID" : "INVERTER_OFF_GRID";
    const perKw = i.systemType === "ON_GRID" ? "INVERTER_ON_GRID_KW" : `${base}_KW`;
    const sized = `${base}_${codeNum(kw)}KW`;
    const known = sized in rates;
    const name = i.systemType === "ON_GRID" ? "On-grid inverter" : i.systemType === "HYBRID" ? "Hybrid inverter" : "Off-grid PCU";
    add({
      code: "INVERTER",
      group: "Inverter",
      label: `${name} ${kw} kW${hasBattery ? `, ${systemVoltage(kw)} V` : ""}${i.phase === "THREE" ? ", 3-phase" : ""}`,
      quantity: 1,
      unit: "piece",
      rate: known ? rates[sized]! : rate(perKw) * kw,
      basis: known ? `rate card, ${kw} kW` : `no ${kw} kW price on the card — ${inrShort(rate(perKw))}/kW × ${kw} kW`,
    });
  }

  // ── Battery bank ──
  let battery: BatteryPlan | null = null;
  if (hasBattery) {
    battery = planBattery(i, rates);
    const c = battery.chosen;
    add({
      code: "BATTERY",
      group: "Battery bank",
      label: c.chemistry === "LEAD_ACID" ? `Tubular battery 12 V ${c.ah} Ah` : `Lithium (LFP) battery ${c.unitLabel}`,
      quantity: c.units,
      unit: "piece",
      rate: c.unitPrice,
      basis:
        c.chemistry === "LEAD_ACID"
          ? `${c.series} in series × ${c.strings} string${c.strings > 1 ? "s" : ""} at ${battery.systemVoltage} V for ${battery.neededKwh} kWh (50% usable)`
          : `${c.units} pack${c.units > 1 ? "s" : ""} in parallel at ${battery.systemVoltage} V for ${battery.neededKwh} kWh (90% usable)`,
    });
    if (c.chemistry === "LEAD_ACID") {
      add({
        code: "BATTERY_RACK",
        group: "Battery bank",
        label: "Battery rack, links and cabling",
        quantity: c.units,
        unit: "battery",
        rate: rate("BATTERY_RACK"),
        basis: `${c.units} batteries`,
      });
    }
  }

  // ── Cables & protection ──
  const dcRun = pos(i.roofToInverterM);
  const acRun = pos(i.inverterToMeterM);
  const dcSqmm = sizeDcCable(kw, dcRun);
  const ac = sizeAcCable(kw, i.phase, acRun, i.acCable);
  const dcMetres = Math.ceil(dcRun * 2 + 10); // + and −, plus string links
  add({ code: "DCDB", group: "Cables & protection", label: "DCDB", quantity: 1, unit: "piece", rate: rate("DCDB"), basis: "one per system" });
  add({ code: "ACDB", group: "Cables & protection", label: "ACDB", quantity: 1, unit: "piece", rate: rate("ACDB"), basis: "one per system" });
  add({
    code: "WIRE_DC",
    group: "Cables & protection",
    label: `DC solar cable ${dcSqmm} sq mm`,
    quantity: dcMetres,
    unit: "m",
    rate: rate(`WIRE_DC_${dcSqmm}`, rate("WIRE_DC")),
    basis: `2 × ${dcRun} m roof-to-inverter + 10 m links · ${dcSqmm === 4 ? "4 sq mm suits up to 5 kW on short runs" : "6 sq mm for a bigger array or a long run"}`,
  });
  add({
    code: "WIRE_AC",
    group: "Cables & protection",
    label: ac.label,
    quantity: Math.ceil(acRun),
    unit: "m",
    rate: rate(ac.code, rate("WIRE_AC")),
    basis: `${ac.currentA} A${i.phase === "THREE" ? " per phase" : ""}, ${ac.dropPct}% drop over ${acRun} m${
      ac.armoured && i.acCable === "AUTO" ? " · armoured for 3-phase" : ""
    }`,
  });
  add({ code: "WIRE_EARTHING", group: "Cables & protection", label: "Earthing cable 6 sq mm copper", quantity: Math.ceil(pos(i.earthingRunM)), unit: "m", rate: rate("WIRE_EARTHING"), basis: "assumed run" });
  add({ code: "WIRE_LA", group: "Cables & protection", label: "LA down conductor 16 sq mm aluminium", quantity: Math.ceil(pos(i.laRunM)), unit: "m", rate: rate("WIRE_LA"), basis: "assumed run" });
  add({ code: "PIPE", group: "Cables & protection", label: "Conduit pipe (3 m)", quantity: Math.ceil((dcRun + acRun) / 3), unit: "pipe", rate: rate("PIPE"), basis: `${dcRun + acRun} m of run ÷ 3 m` });
  add({ code: "EARTHING", group: "Cables & protection", label: "Earthing kit with lightning arrester", quantity: 1, unit: "kit", rate: rate("EARTHING"), basis: "one per system" });

  // ── Structure ──
  {
    const sized = `STRUCTURE_${codeNum(kw)}KW`;
    const known = sized in rates;
    add({
      code: "STRUCTURE",
      group: "Structure",
      label: `Mounting structure ${kw} kW`,
      quantity: 1,
      unit: "unit",
      rate: known ? rates[sized]! : rate("STRUCTURE_KW") * kw,
      basis: known ? `rate card, ${kw} kW` : `no ${kw} kW price on the card — ${inrShort(rate("STRUCTURE_KW"))}/kW × ${kw} kW`,
    });
  }

  // ── Site & services ──
  {
    const watts = chargeableWatts(kw);
    add({
      code: "LABOUR",
      group: "Site & services",
      label: "Installation labour",
      quantity: watts,
      unit: "W",
      rate: rate("LABOUR_W", 2),
      basis: kw % 1 ? `charged on whole kW: ${kw} kW → ${watts / 1000} kW` : `${kw} kW`,
    });
  }
  add({ code: "CIVIL", group: "Site & services", label: "Cement & civil work", quantity: 1, unit: "site", rate: rate("CIVIL_SITE"), basis: "per site" });
  add({ code: "TRANSPORT", group: "Site & services", label: "Transportation", quantity: 1, unit: "site", rate: rate("TRANSPORT_SITE"), basis: "per site" });
  if (gridTied) {
    add({ code: "DISCOM", group: "Site & services", label: "Electricity department & net meter", quantity: 1, unit: "site", rate: rate("DISCOM_SITE"), basis: "net metering, testing, application" });
  }
  add({ code: "AGREEMENT", group: "Site & services", label: "Agreement & documentation", quantity: 1, unit: "site", rate: rate("AGREEMENT_SITE"), basis: "per site" });

  // ── Apply edits ──
  const removed = new Set(i.removed ?? []);
  const lines: EstimateLine[] = proposed
    .filter((l) => !removed.has(l.code))
    .map((l) => {
      const o = i.overrides?.[l.code] ?? {};
      const quantity = o.quantity !== undefined && Number.isFinite(o.quantity) ? o.quantity : l.quantity;
      const r = o.rate !== undefined && Number.isFinite(o.rate) ? o.rate : l.rate;
      return {
        ...l,
        label: o.label?.trim() || l.label,
        quantity: round2(quantity),
        rate: round2(r),
        amount: round2(quantity * r),
        edited: o.quantity !== undefined || o.rate !== undefined,
      };
    });
  (i.extras ?? []).forEach((e, n) => {
    if (!e.label?.trim() && !e.rate) return;
    const quantity = pos(e.quantity);
    const r = pos(e.rate);
    lines.push({
      code: `EXTRA_${n}`,
      group: "Site & services",
      label: e.label?.trim() || "Other",
      quantity,
      unit: e.unit || "piece",
      rate: r,
      amount: round2(quantity * r),
      basis: "added by hand",
      edited: true,
    });
  });

  const cost = round2(lines.reduce((s, l) => s + l.amount, 0));
  const byGroup = LINE_GROUPS.map((group) => ({
    group,
    amount: round2(lines.filter((l) => l.group === group).reduce((s, l) => s + l.amount, 0)),
  })).filter((g) => g.amount > 0);

  const quoteBeforeGst = cost > 0 ? quoteRound(cost * (1 + pos(i.marginPct) / 100)) : 0;
  const gst = round2((quoteBeforeGst * pos(i.gstPct)) / 100);
  const quoteWithGst = round2(quoteBeforeGst + gst);
  const subsidy = rules.eligible ? pmSuryaGharSubsidy(dcKw, i.systemType, i.dcr) : 0;
  const customerPays = Math.max(quoteWithGst - subsidy, 0);

  const annualKwh = Math.round(dcKw * pos(i.yieldPerKwDay, 4.2) * 365 * 0.95);
  // Off-grid displaces diesel or nothing billable, so payback is not claimed.
  const annualSavings = gridTied ? Math.round(annualKwh * pos(i.tariff)) : 0;
  const paybackYears = annualSavings > 0 ? round2(customerPays / annualSavings) : null;

  return {
    lines,
    panelCount,
    dcCapacityKw: dcKw,
    battery,
    cable: { dcSqmm, ac },
    cost,
    costPerWatt: dcKw > 0 ? round2(cost / (dcKw * 1000)) : 0,
    byGroup,
    quoteBeforeGst,
    gst,
    quoteWithGst,
    margin: round2(quoteBeforeGst - cost),
    subsidy,
    noSubsidyReason: subsidy ? null : (rules.reason ?? (i.dcr ? null : "non-DCR panels — not eligible for subsidy")),
    dcr: i.dcr,
    dcrLocked: rules.dcrLocked,
    customerPays,
    annualKwh,
    annualSavings,
    paybackYears,
  };
}
