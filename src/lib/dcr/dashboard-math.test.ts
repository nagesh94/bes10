import { describe, expect, it } from "vitest";
import { computeStats, financialYear, monthKeys, type CertRow, type SerialRow } from "./dashboard-math";

const certs: CertRow[] = [
  { id: 1, certificateNo: "A", certDate: "2026-11-17", supplierId: 1, supplier: "Smart Solar", moduleManufacturer: "Premier", modelNo: "PE-620", wattPeak: 620 },
  { id: 2, certificateNo: "B", certDate: "2026-05-02", supplierId: 2, supplier: "Sun Traders", moduleManufacturer: "Waaree", modelNo: "WS-545", wattPeak: 545 },
];

const serials: SerialRow[] = [
  // Certificate A: 3 panels, one installed, one on two projects, one in stock.
  { certificateId: 1, serialNo: "A1", wattPeak: 620, projectId: "p1", installationDate: "2026-11-20" },
  { certificateId: 1, serialNo: "A2", wattPeak: 620, projectId: "p1", installationDate: "2026-11-20" },
  { certificateId: 1, serialNo: "A2", wattPeak: 620, projectId: "p2", installationDate: "2026-11-25" },
  { certificateId: 1, serialNo: "A3", wattPeak: 620, projectId: null, installationDate: null },
  // Certificate B: 2 panels, both in stock and old.
  { certificateId: 2, serialNo: "B1", wattPeak: 545, projectId: null, installationDate: null },
  { certificateId: 2, serialNo: "B2", wattPeak: 545, projectId: null, installationDate: null },
];

const s = computeStats(certs, serials, { today: "2026-11-22", monthFrom: "2026-05", monthTo: "2026-11" });

describe("computeStats", () => {
  it("counts each serial once, however many projects list it", () => {
    expect(s.panels).toBe(5);
    expect(s.installed).toBe(2);
    expect(s.inStock).toBe(3);
    expect(s.kw).toBeCloseTo(3 * 0.62 + 2 * 0.545);
    expect(s.stockKw).toBeCloseTo(0.62 + 2 * 0.545);
  });

  it("reports a serial on two projects", () => {
    expect(s.doubleBooked).toEqual([{ serialNo: "A2", certificateId: 1, projects: 2 }]);
  });

  it("groups by supplier, most stock first", () => {
    expect(s.bySupplier.map((b) => [b.label, b.panels, b.installed, b.inStock])).toEqual([
      ["Sun Traders", 2, 0, 2],
      ["Smart Solar", 3, 2, 1],
    ]);
  });

  it("ages stock by certificate date", () => {
    expect(s.ageing.map((a) => a.panels)).toEqual([1, 0, 0, 2]);
  });

  it("puts receipts and installs in their months", () => {
    const nov = s.months.find((m) => m.key === "2026-11")!;
    const may = s.months.find((m) => m.key === "2026-05")!;
    expect(nov).toMatchObject({ received: 3, installed: 2 });
    expect(may).toMatchObject({ received: 2, installed: 0 });
    expect(s.months).toHaveLength(7);
  });

  it("keeps per-certificate totals for the stock table", () => {
    expect(s.perCertificate.get(1)).toMatchObject({ panels: 3, installed: 2 });
    expect(s.perCertificate.get(2)).toMatchObject({ panels: 2, installed: 0 });
  });

  it("ignores serials of certificates outside the filter", () => {
    const only = computeStats([certs[0]!], serials, { today: "2026-11-22", monthFrom: "2026-11", monthTo: "2026-11" });
    expect(only.panels).toBe(3);
    expect(only.bySupplier).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("lists months across a year end", () => {
    expect(monthKeys("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("finds the Indian financial year", () => {
    expect(financialYear("2026-11-22")).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "FY 26-27" });
    expect(financialYear("2027-02-10")).toMatchObject({ from: "2026-04-01" });
    expect(financialYear("2026-11-22", -1)).toMatchObject({ label: "FY 25-26" });
  });
});
