import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseSerial, toIsoDate } from "./fields";
import { parseDcrText, parserCoverage } from "./parse";

const sample = readFileSync(join(__dirname, "fixtures", "nise-b2b.txt"), "utf8");

describe("parseDcrText on a NISE B2B certificate", () => {
  const f = parseDcrText(sample);

  it("reads the header", () => {
    expect(f.certificateNo).toBe("1682-6431-3308-6415");
    expect(f.certType).toBe("B2B");
    expect(f.revision).toBe("00");
    expect(f.certDate).toBe("2026-11-17");
  });

  it("reads the supplier and who it was issued to", () => {
    expect(f.supplierName).toBe("Smart Solar Energies");
    expect(f.supplierGstin).toBe("23ABXPN4495Q1ZH");
    expect(f.supplierPan).toBe("ABXPN4495Q");
    expect(f.supplierState).toBe("Madhya Pradesh");
    expect(f.supplierPincode).toBe("462026");
    expect(f.supplierAddress).toContain("221, Jyoti Nagar");
    expect(f.issuedToName).toBe("Bhim Energy Solutions");
    expect(f.issuedToGstin).toBe("23CCYPS1427F1ZC");
  });

  it("reads the purchase order and invoice", () => {
    expect(f.purchaseOrderNo).toBe("SS/PO/26-27/350");
    expect(f.invoiceRef).toBe("SS/26-27/350");
    expect(f.invoiceDate).toBe("2026-11-17");
  });

  it("reads both manufacturers with their wrapped addresses", () => {
    expect(f.cellManufacturer).toBe("Premier Energies Photovoltaic Private Limited");
    expect(f.cellManufacturerAddress).toMatch(/^Plot No-8\/B\/1.*Telangana-501359, India$/);
    expect(f.moduleManufacturer).toBe("Premier Energies Global Environment Private Limited");
    expect(f.moduleManufacturerAddress).toMatch(/^Plot No S-95.*Telangana, India$/);
  });

  it("reads the module", () => {
    expect(f.modelNo).toBe("PE-132-620THGB-G12R");
    expect(f.wattPeak).toBe("620");
    expect(f.efficiency).toBe("22.95");
    expect(f.technology).toBe("TopCon");
    expect(f.moduleDescription).toBe("Bifacial N-Type TOPCon Module (Glass to Glass)");
    expect(f.cellModel).toBe("PE_BLUE SHARK_N TYPE_TOPCON 16BB");
    expect(f.quantity).toBe("5");
    expect(f.totalKw).toBe("3.10");
  });

  it("reads the chain of custody in order", () => {
    expect(f.chain).toHaveLength(10);
    expect(f.chain[0]).toEqual({
      date: "2026-10-28",
      event: "Wafer to Cell Conversion",
      party: "Premier Energies Photovoltaic Private Limited",
    });
    expect(f.chain.at(-1)).toEqual({
      date: "2026-11-02",
      event: "DCR Claimed",
      party: "Smart Solar Energies",
    });
  });

  it("reads every panel serial", () => {
    expect(f.serials.map((s) => s.serialNo)).toEqual([
      "NSMS26100028841",
      "NSMS26100028902",
      "NSMS26100029012",
      "NSMS26100029114",
      "NSMS26100029189",
    ]);
    expect(f.serials.every((s) => s.wattPeak === "620")).toBe(true);
  });

  it("reports full coverage", () => {
    expect(parserCoverage(f).missing).toEqual([]);
  });
});

describe("parseDcrText on text it does not recognise", () => {
  it("leaves fields empty rather than guessing", () => {
    const f = parseDcrText("An invoice for 5 panels.");
    expect(f.certificateNo).toBe("");
    expect(f.serials).toEqual([]);
    expect(parserCoverage(f).filled).toBe(0);
  });
});

describe("helpers", () => {
  it.each([
    ["17-Nov-2026", "2026-11-17"],
    ["28-Oct-26", "2026-10-28"],
    ["2-Nov-26", "2026-11-02"],
    ["17/11/2026", "2026-11-17"],
    ["2026-11-17", "2026-11-17"],
    ["soon", ""],
  ])("toIsoDate(%s) = %s", (input, expected) => {
    expect(toIsoDate(input)).toBe(expected);
  });

  it("normalises serials typed with spaces and lower case", () => {
    expect(normaliseSerial(" nsms 2610 0028841 ")).toBe("NSMS26100028841");
  });
});
