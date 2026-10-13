import { describe, expect, it } from "vitest";
import { apportion, DEFAULT_AGREEMENT_SCHEDULE, emptyAgreement } from "./form-values";

/**
 * The only arithmetic in the agreement maker.
 *
 * It matters more than its size suggests: the instalments print inside
 * clause 19.1 of a document a notary reads, and a schedule that does not
 * add up to the cost stated two lines above it is the one mistake in this
 * document that gets it sent back.
 */
describe("apportion", () => {
  it("splits a round total 10 / 70 / 10 / 10", () => {
    expect(apportion(220000).map((m) => m.amount)).toEqual([
      "22000",
      "154000",
      "22000",
      "22000",
    ]);
  });

  it("always adds up to the total, however it rounds", () => {
    // 333333 divides into nothing clean — the drift has to land somewhere.
    for (const total of [333333, 195001, 7, 123457, 1000003]) {
      const sum = apportion(total).reduce((acc, m) => acc + Number(m.amount), 0);
      expect(sum).toBe(total);
    }
  });

  it("puts the rounding drift on the largest instalment", () => {
    // 10% of 333333 rounds to 33333 three times and 70% to 233333, which is
    // 332 short; the 70% line absorbs it rather than the 10% lines.
    const rows = apportion(333333);
    expect(rows.map((m) => m.amount)).toEqual(["33333", "233334", "33333", "33333"]);
  });

  it("leaves the amounts blank when there is no total yet", () => {
    for (const total of [0, -5, Number.NaN]) {
      const rows = apportion(total);
      expect(rows).toHaveLength(DEFAULT_AGREEMENT_SCHEDULE.length);
      expect(rows.every((m) => m.amount === "")).toBe(true);
      // The labels still arrive, so the form is never an empty table.
      expect(rows[0]?.label).toBe(DEFAULT_AGREEMENT_SCHEDULE[0]?.label);
    }
  });
});

describe("emptyAgreement", () => {
  it("starts on today's date with the standard schedule and no cost", () => {
    const blank = emptyAgreement("2026-10-13");
    expect(blank.executionDate).toBe("2026-10-13");
    expect(blank.totalValue).toBe("");
    expect(blank.valueSource).toBe("typed");
    expect(blank.milestones).toHaveLength(4);
    expect(blank.milestones.every((m) => m.amount === "")).toBe(true);
  });
});
