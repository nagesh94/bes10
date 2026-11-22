import { describe, expect, it } from "vitest";
import {
  calculateEstimate,
  chargeableWatts,
  planBattery,
  pmSuryaGharSubsidy,
  sizeAcCable,
  sizeDcCable,
  systemVoltage,
} from "./engine";

const RATES: Record<string, number> = {
  PANEL: 26,
  INVERTER_3KW: 16500,
  INVERTER_ON_GRID_KW: 5500,
  INVERTER_HYBRID_5KW: 70000,
  INVERTER_HYBRID_KW: 15000,
  INVERTER_OFF_GRID_KW: 8000,
  BATTERY_LEAD_ACID_150AH: 14100,
  BATTERY_LEAD_ACID_200AH: 18700,
  BATTERY_LITHIUM_51_2V_100AH: 100000,
  BATTERY_LITHIUM_KWH: 20000,
  BATTERY_RACK: 600,
  STRUCTURE_3KW: 13000,
  STRUCTURE_KW: 4400,
  WIRE_DC_4: 50,
  WIRE_DC_6: 70,
  AC_FLEX_2C_4: 180,
  AC_ARM_4C_6: 420,
  LABOUR_W: 2,
  DCDB: 1500,
  ACDB: 1000,
  EARTHING: 1500,
};

describe("pmSuryaGharSubsidy", () => {
  it("pays 30k per kW for the first two kW and 18k for the third", () => {
    expect(pmSuryaGharSubsidy(1, "ON_GRID", true)).toBe(30000);
    expect(pmSuryaGharSubsidy(2, "ON_GRID", true)).toBe(60000);
    expect(pmSuryaGharSubsidy(3, "ON_GRID", true)).toBe(78000);
    expect(pmSuryaGharSubsidy(2.5, "HYBRID", true)).toBe(69000);
  });
  it("caps at 78k and pays nothing off-grid or without DCR panels", () => {
    expect(pmSuryaGharSubsidy(10, "ON_GRID", true)).toBe(78000);
    expect(pmSuryaGharSubsidy(3, "OFF_GRID", true)).toBe(0);
    expect(pmSuryaGharSubsidy(3, "ON_GRID", false)).toBe(0);
  });
});

describe("segment and subsidy", () => {
  const R = { ...RATES, PANEL_NON_DCR: 16 };
  it("subsidises a residential DCR job that opts in", () => {
    const r = calculateEstimate({ segment: "RESIDENTIAL", optSubsidy: true, dcr: false, capacityKw: 3 }, R);
    // Opting in forces DCR, whatever was ticked.
    expect(r.dcr).toBe(true);
    expect(r.subsidy).toBe(78000);
    expect(r.lines.find((l) => l.code === "PANEL")?.rate).toBe(26);
  });
  it("prices commercial on non-DCR panels with no subsidy", () => {
    const r = calculateEstimate({ segment: "COMMERCIAL", optSubsidy: true, dcr: true, capacityKw: 10 }, R);
    expect(r.dcr).toBe(false);
    expect(r.subsidy).toBe(0);
    expect(r.customerPays).toBe(r.quoteWithGst);
    expect(r.lines.find((l) => l.code === "PANEL")?.rate).toBe(16);
    expect(r.noSubsidyReason).toMatch(/commercial/);
  });
  it("gives no subsidy to a residential customer not opting, DCR or not", () => {
    const dcr = calculateEstimate({ segment: "RESIDENTIAL", optSubsidy: false, dcr: true, capacityKw: 3 }, R);
    const nonDcr = calculateEstimate({ segment: "RESIDENTIAL", optSubsidy: false, dcr: false, capacityKw: 3 }, R);
    expect(dcr.subsidy).toBe(0);
    expect(nonDcr.subsidy).toBe(0);
    expect(nonDcr.lines.find((l) => l.code === "PANEL")?.rate).toBe(16);
  });
});

describe("labour", () => {
  it("charges on whole kilowatts only", () => {
    expect(chargeableWatts(3)).toBe(3000);
    expect(chargeableWatts(3.6)).toBe(3000);
    expect(chargeableWatts(0.5)).toBe(1000);
    const r = calculateEstimate({ capacityKw: 3.6 }, RATES);
    expect(r.lines.find((l) => l.code === "LABOUR")?.amount).toBe(6000);
  });
});

describe("cables", () => {
  it("uses 4 sq mm DC up to 5 kW on a short run and 6 beyond", () => {
    expect(sizeDcCable(3, 20)).toBe(4);
    expect(sizeDcCable(5, 30)).toBe(4);
    expect(sizeDcCable(6, 20)).toBe(6);
    expect(sizeDcCable(3, 40)).toBe(6);
  });
  it("sizes single-phase AC on current and voltage drop", () => {
    const small = sizeAcCable(3, "SINGLE", 15, "AUTO");
    expect(small).toMatchObject({ armoured: false, cores: 2, sqmm: 4, code: "AC_FLEX_2C_4" });
    // A long run of a big single-phase system needs a heavier cable.
    expect(sizeAcCable(5, "SINGLE", 60, "AUTO").sqmm).toBeGreaterThan(4);
  });
  it("goes armoured 4-core for three-phase by default", () => {
    expect(sizeAcCable(10, "THREE", 20, "AUTO")).toMatchObject({ armoured: true, cores: 4, code: "AC_ARM_4C_6" });
    expect(sizeAcCable(10, "THREE", 20, "FLEX").armoured).toBe(false);
  });
});

describe("batteries", () => {
  it("sizes a lead-acid bank in 12 V blocks, after inverter losses", () => {
    expect(systemVoltage(3)).toBe(48);
    const plan = planBattery(
      { loadMode: "SIMPLE", backupLoadKw: 1, backupHours: 4, appliances: [], capacityKw: 3, chemistry: "LEAD_ACID", leadAcidAh: 150, lithiumAh: 100 },
      RATES,
    );
    // 4 kWh ÷ 0.9 = 4.44 kWh; one 48 V string of 150 Ah holds 3.6 kWh usable.
    expect(plan.neededKwh).toBe(4.44);
    expect(plan.chosen).toMatchObject({ units: 8, series: 4, strings: 2, unitPrice: 14100 });
  });
  it("prices lithium in whole packs from the card", () => {
    const plan = planBattery(
      { loadMode: "SIMPLE", backupLoadKw: 2, backupHours: 3, appliances: [], capacityKw: 5, chemistry: "LITHIUM", leadAcidAh: 150, lithiumAh: 100 },
      RATES,
    );
    expect(plan.chosen).toMatchObject({ units: 2, unitLabel: "51.2 V 100 Ah LFP", unitPrice: 100000 });
    expect(plan.chosen.installedKwh).toBe(10.24);
  });
  it("adds up an appliance list, fridge at half duty", () => {
    const plan = planBattery(
      {
        loadMode: "APPLIANCES",
        backupLoadKw: 0,
        backupHours: 0,
        appliances: [
          { name: "Fan", watts: 75, qty: 2, hours: 4, duty: 1 },
          { name: "Fridge", watts: 150, qty: 1, hours: 4, duty: 0.5 },
        ],
        capacityKw: 3,
        chemistry: "LITHIUM",
        leadAcidAh: 150,
        lithiumAh: 100,
      },
      RATES,
    );
    expect(plan.loadKwh).toBe(0.9);
    expect(plan.peakKw).toBe(0.3);
    expect(plan.inverterTooSmall).toBe(false);
  });
});

describe("calculateEstimate", () => {
  it("prices a 3 kW on-grid job from the sized rate-card lines", () => {
    const r = calculateEstimate({ systemType: "ON_GRID", capacityKw: 3, panelWp: 550 }, RATES);
    expect(r.panelCount).toBe(6);
    expect(r.lines.find((l) => l.code === "INVERTER")?.rate).toBe(16500);
    expect(r.lines.find((l) => l.code === "STRUCTURE")?.rate).toBe(13000);
    expect(r.lines.find((l) => l.code === "WIRE_AC")?.rate).toBe(180);
    expect(r.battery).toBeNull();
    expect(r.quoteBeforeGst % 500).toBe(0);
  });

  it("falls back to per-kW rates for a size with no card line", () => {
    const r = calculateEstimate({ systemType: "ON_GRID", capacityKw: 4 }, RATES);
    expect(r.lines.find((l) => l.code === "INVERTER")?.rate).toBe(22000);
    expect(r.lines.find((l) => l.code === "STRUCTURE")?.rate).toBe(17600);
  });

  it("uses the sized hybrid inverter and drops DISCOM fees off-grid", () => {
    const hybrid = calculateEstimate({ systemType: "HYBRID", capacityKw: 5 }, RATES);
    expect(hybrid.lines.find((l) => l.code === "INVERTER")?.rate).toBe(70000);
    expect(hybrid.subsidy).toBe(78000);
    const off = calculateEstimate({ systemType: "OFF_GRID", capacityKw: 3, chemistry: "LEAD_ACID" }, RATES);
    expect(off.lines.some((l) => l.code === "DISCOM")).toBe(false);
    expect(off.lines.some((l) => l.code === "BATTERY_RACK")).toBe(true);
    expect(off.subsidy).toBe(0);
  });

  it("applies overrides, removals and extra lines", () => {
    const r = calculateEstimate(
      {
        systemType: "ON_GRID",
        capacityKw: 3,
        overrides: { INVERTER: { rate: 20000 } },
        removed: ["PIPE"],
        extras: [{ label: "Crane hire", quantity: 1, unit: "day", rate: 4000 }],
      },
      RATES,
    );
    const inverter = r.lines.find((l) => l.code === "INVERTER");
    expect(inverter?.rate).toBe(20000);
    expect(inverter?.edited).toBe(true);
    expect(r.lines.some((l) => l.code === "PIPE")).toBe(false);
    expect(r.lines.find((l) => l.label === "Crane hire")?.amount).toBe(4000);
  });
});
