import { describe, expect, it } from "vitest";
import {
  checkLoadEnhancement,
  checkNameMismatch,
  compareName,
  deriveFlags,
  normaliseName,
  requiredSanctionedKw,
} from "./engine";

describe("normaliseName", () => {
  it.each([
    ["Shri Rajesh Kumar", "RAJESH KUMAR"],
    ["  RAJESH   KUMAR  ", "RAJESH KUMAR"],
    ["Smt. Krishni Nagde", "KRISHNI NAGDE"],
    ["Mrs Krishni Nagde", "KRISHNI NAGDE"],
    ["M/S Bhim Energy", "BHIM ENERGY"],
    ["Rajesh-Kumar", "RAJESH KUMAR"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });
});

describe("compareName", () => {
  it("treats honorifics and spacing as the same person", () => {
    expect(compareName("Shri Rajesh Kumar", "RAJESH  KUMAR").verdict).toBe("match");
  });

  it("treats initials as the same person", () => {
    expect(compareName("R. C. Singh", "Ramesh Chauhan Singh").verdict).toBe("match");
    expect(compareName("Krishni Nagde", "K Nagde").verdict).toBe("match");
  });

  it("flags a genuinely different name", () => {
    expect(compareName("Rajesh Kumar", "Suresh Kumar").verdict).toBe("mismatch");
    expect(compareName("Ramesh Chauhan", "R. C. Singh").verdict).toBe("mismatch");
  });

  it("surfaces a typo as near rather than deciding for the employee", () => {
    expect(compareName("Rajesh Kumar", "Rajesh Kummar").verdict).toBe("near");
  });
});

describe("checkNameMismatch", () => {
  it("raises nothing when all four agree", () => {
    const result = checkNameMismatch([
      { source: "AADHAAR", name: "Ramesh Chauhan" },
      { source: "PAN", name: "RAMESH CHAUHAN" },
      { source: "BANK", name: "Shri Ramesh Chauhan" },
      { source: "BILL", name: "Ramesh  Chauhan" },
    ]);
    expect(result.raised).toBe(false);
    expect(result.mismatchedSources).toEqual([]);
  });

  it("raises on the bill when it carries a different surname", () => {
    const result = checkNameMismatch([
      { source: "AADHAAR", name: "Ramesh Chauhan" },
      { source: "PAN", name: "Ramesh Chauhan" },
      { source: "BANK", name: "Ramesh Chauhan" },
      { source: "BILL", name: "R. C. Singh" },
    ]);
    expect(result.raised).toBe(true);
    expect(result.mismatchedSources).toEqual(["BILL"]);
    expect(result.reference?.source).toBe("AADHAAR");
  });

  it("compares against Aadhaar even when it is not listed first", () => {
    const result = checkNameMismatch([
      { source: "BILL", name: "Suresh Kumar" },
      { source: "AADHAAR", name: "Rajesh Kumar" },
    ]);
    expect(result.reference?.source).toBe("AADHAAR");
    expect(result.mismatchedSources).toEqual(["BILL"]);
  });

  it("asks for review rather than raising when the only difference is a typo", () => {
    const result = checkNameMismatch([
      { source: "AADHAAR", name: "Rajesh Kumar" },
      { source: "BILL", name: "Rajesh Kummar" },
    ]);
    expect(result.raised).toBe(false);
    expect(result.needsReview).toBe(true);
  });

  it("does nothing with fewer than two names", () => {
    expect(checkNameMismatch([{ source: "AADHAAR", name: "Rajesh Kumar" }]).raised).toBe(false);
    expect(checkNameMismatch([]).raised).toBe(false);
  });

  it("ignores blank entries", () => {
    const result = checkNameMismatch([
      { source: "AADHAAR", name: "Rajesh Kumar" },
      { source: "PAN", name: "   " },
    ]);
    expect(result.raised).toBe(false);
  });
});

describe("requiredSanctionedKw", () => {
  // BHIM's rule: sanctioned load must be GREATER than the plant, so a 3 kW
  // plant on a 2 kW connection goes to 4 kW, not 3.
  it.each([
    [3, 4],
    [2, 3],
    [5, 6],
    [10, 11],
    [4.82, 5],
    [3.27, 4],
  ])("a %s kW plant needs %s kW sanctioned", (plant, required) => {
    expect(requiredSanctionedKw(plant)).toBe(required);
  });

  it("supports the at-least rule where a DISCOM accepts it", () => {
    expect(requiredSanctionedKw(3, "atLeast")).toBe(3);
    expect(requiredSanctionedKw(4.82, "atLeast")).toBe(5);
  });
});

describe("checkLoadEnhancement", () => {
  it("raises for a 3 kW plant on a 2 kW connection", () => {
    const result = checkLoadEnhancement(3, 2);
    expect(result.raised).toBe(true);
    expect(result.requiredKw).toBe(4);
  });

  it("still raises when sanctioned equals the plant", () => {
    expect(checkLoadEnhancement(3, 3).raised).toBe(true);
  });

  it("clears once the enhancement is approved", () => {
    expect(checkLoadEnhancement(3, 4).raised).toBe(false);
  });

  it("clears for a headroom connection", () => {
    expect(checkLoadEnhancement(4.82, 6).raised).toBe(false);
  });
});

describe("deriveFlags", () => {
  it("raises both flags together", () => {
    const flags = deriveFlags({
      names: [
        { source: "AADHAAR", name: "Ramesh Chauhan" },
        { source: "BILL", name: "R. C. Singh" },
      ],
      plantKw: 3,
      sanctionedKw: 2,
    });
    expect(flags.map((f) => f.type).sort()).toEqual(["LOAD_ENHANCEMENT", "NAME_MISMATCH"]);
  });

  it("raises nothing on a clean project", () => {
    const flags = deriveFlags({
      names: [
        { source: "AADHAAR", name: "Krishni Nagde" },
        { source: "PAN", name: "KRISHNI NAGDE" },
      ],
      plantKw: 4.82,
      sanctionedKw: 5,
    });
    expect(flags).toEqual([]);
  });

  it("skips the load rule until both numbers are known", () => {
    expect(deriveFlags({ names: [], plantKw: null, sanctionedKw: 2 })).toEqual([]);
    expect(deriveFlags({ names: [], plantKw: 3, sanctionedKw: null })).toEqual([]);
  });
});
