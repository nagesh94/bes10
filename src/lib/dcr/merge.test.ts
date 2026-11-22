import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_FIELDS, type DcrFields } from "./fields";
import { checkConsistency, mergeExtraction } from "./merge";
import { parseDcrText } from "./parse";

const text = readFileSync(join(__dirname, "fixtures", "nise-b2b.txt"), "utf8");
const parsed = parseDcrText(text);
const blank = (): DcrFields => ({ ...EMPTY_FIELDS, chain: [], serials: [] });

describe("mergeExtraction", () => {
  it("uses the parser alone when there is no model answer", () => {
    const m = mergeExtraction(parsed, null, text);
    expect(m.method).toBe("parser");
    expect(m.fields).toBe(parsed);
  });

  it("keeps the parser's value and reports the disagreement", () => {
    const llm = { ...parsed, purchaseOrderNo: "SS/PO/26-27/305" };
    const m = mergeExtraction(parsed, llm, text);
    expect(m.method).toBe("parser+llm");
    expect(m.fields.purchaseOrderNo).toBe("SS/PO/26-27/350");
    expect(m.conflicts).toEqual([
      { key: "purchaseOrderNo", parser: "SS/PO/26-27/350", llm: "SS/PO/26-27/305" },
    ]);
  });

  it("does not call 3.1 and 3.10 a disagreement", () => {
    const m = mergeExtraction(parsed, { ...parsed, totalKw: "3.1" }, text);
    expect(m.conflicts).toEqual([]);
  });

  it("fills a gap from the model and verifies it against the text", () => {
    const partial = { ...parsed, invoiceRef: "", supplierGstin: "" };
    const llm = { ...parsed, supplierGstin: "23AAAAA0000A1Z5" };
    const m = mergeExtraction(partial, llm, text);
    expect(m.fields.invoiceRef).toBe("SS/26-27/350");
    expect(m.fields.supplierGstin).toBe("23AAAAA0000A1Z5");
    expect(m.unverified).toEqual(["supplierGstin"]);
  });

  it("drops model serials that are not on the certificate", () => {
    const llm = {
      ...blank(),
      serials: [
        { serialNo: "NSMS26100028841", wattPeak: "620" },
        { serialNo: "NSMS99999999999", wattPeak: "620" },
      ],
    };
    const m = mergeExtraction({ ...parsed, serials: [] }, llm, text);
    expect(m.fields.serials.map((s) => s.serialNo)).toEqual(["NSMS26100028841"]);
    expect(m.droppedSerials).toEqual(["NSMS99999999999"]);
  });

  it("trusts the model on a scan, and says so", () => {
    const llm = { ...parsed };
    const m = mergeExtraction(blank(), llm, "");
    expect(m.method).toBe("llm-pdf");
    expect(m.fields.serials).toHaveLength(5);
    expect(m.unverified).toEqual([]);
  });
});

describe("checkConsistency", () => {
  it("passes the sample certificate", () => {
    expect(checkConsistency(parsed, ["23CCYPS1427F1ZC"])).toEqual([]);
  });

  it("catches a missing serial and wrong kW", () => {
    const f = { ...parsed, totalKw: "3.5", serials: parsed.serials.slice(0, 4) };
    expect(checkConsistency(f).map((i) => i.code)).toEqual(["QTY_SERIALS", "KW_MISMATCH"]);
  });

  it("catches a certificate addressed to someone else", () => {
    expect(checkConsistency(parsed, ["23ZZZZZ9999Z1Z9"]).map((i) => i.code)).toEqual([
      "NOT_ADDRESSED_TO_US",
    ]);
  });

  it("catches a duplicated serial", () => {
    const f = { ...parsed, quantity: "6", totalKw: "3.72", serials: [...parsed.serials, parsed.serials[0]!] };
    expect(checkConsistency(f).map((i) => i.code)).toEqual(["DUPLICATE_SERIAL"]);
  });
});
