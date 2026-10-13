import { describe, expect, it } from "vitest";
import {
  arrayKw,
  capacityWord,
  defaultItems,
  inr,
  SCOPE_ROWS,
  subjectLine,
} from "./content";
import { formatQuotationNumber, SERIES_START } from "./number";

describe("amounts print the way the office writes them", () => {
  it("groups in lakhs, not thousands", () => {
    expect(inr(220000)).toBe("2,20,000");
    expect(inr(1234567)).toBe("12,34,567");
    expect(inr(100000)).toBe("1,00,000");
  });

  it("leaves short numbers alone", () => {
    expect(inr(0)).toBe("0");
    expect(inr(999)).toBe("999");
    expect(inr(1000)).toBe("1,000");
  });

  it("keeps paise only when there are any", () => {
    expect(inr(220000.5)).toBe("2,20,000.50");
    expect(inr(220000.0)).toBe("2,20,000");
  });
});

describe("the capacity as the subject line writes it", () => {
  it("drops the decimal on a whole number, as the original does", () => {
    expect(capacityWord(3)).toBe("3KWP");
    expect(capacityWord("3")).toBe("3KWP");
  });

  it("keeps it when there is one", () => {
    expect(capacityWord(4.5)).toBe("4.5KWP");
  });
});

describe("the subject line", () => {
  it("states the capacity, the system and the policy in one sentence", () => {
    const line = subjectLine(3, "ON_GRID", "M.P. Net / Smart Metering Policy");
    expect(line).toContain("3KWP");
    expect(line).toContain("On Grid -Tie Solar System");
    expect(line).toContain("M.P. Net / Smart Metering Policy");
  });

  it("changes with the system type", () => {
    expect(subjectLine(5, "HYBRID", "x")).toContain("Hybrid Solar System");
    expect(subjectLine(5, "OFF_GRID", "x")).toContain("Off Grid Solar System");
  });
});

describe("the panel row states the array, not the sanction", () => {
  it("is six 540 W modules on a 3 kW job, which is 3.24 kW", () => {
    expect(arrayKw(540, 6)).toBe(3.24);
  });

  it("is null until both figures are known, so the row can fall back", () => {
    expect(arrayKw(540, null)).toBeNull();
    expect(arrayKw(null, 6)).toBeNull();
  });

  it("prints the array figure on the panel row", () => {
    const items = defaultItems({ panelWattPeak: 540, panelCount: 6, panelCompany: "Waaree" }, 3);
    expect(items[1]?.qty).toBe("3.24 kw");
    expect(items[1]?.make).toBe("Waaree");
  });

  it("falls back to the headline capacity when no panel is chosen", () => {
    expect(defaultItems({}, 3)[1]?.qty).toBe("3 kw");
  });

  it("names the inverter after the system type", () => {
    expect(defaultItems({ systemType: "HYBRID" }, 3)[2]?.description).toBe("Hybrid Inverter");
    expect(defaultItems({}, 3)[2]?.description).toBe("On Grid Inverter");
  });
});

describe("the scope table", () => {
  it("has the eight rows the original prints", () => {
    expect(SCOPE_ROWS).toHaveLength(8);
  });

  it("ticks both columns for performance monitoring, as the original does", () => {
    const monitoring = SCOPE_ROWS.find((r) => r.key === "monitoring");
    expect(monitoring?.byBhim).toBe(true);
    expect(monitoring?.byCustomer).toBe(true);
  });

  it("ticks only BHIM everywhere else", () => {
    for (const row of SCOPE_ROWS.filter((r) => r.key !== "monitoring")) {
      expect(row.byBhim, row.key).toBe(true);
      expect(row.byCustomer, row.key).toBe(false);
    }
  });

  it("gives every row a distinct key, since overrides are stored by it", () => {
    expect(new Set(SCOPE_ROWS.map((r) => r.key)).size).toBe(SCOPE_ROWS.length);
  });
});

describe("the quotation number series", () => {
  it("starts at BHIM100000 and counts up without padding", () => {
    expect(formatQuotationNumber(SERIES_START)).toBe("BHIM100000");
    expect(formatQuotationNumber(100001)).toBe("BHIM100001");
    expect(formatQuotationNumber(123456)).toBe("BHIM123456");
  });
});
