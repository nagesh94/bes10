import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBill, isComplete } from "./check";
import { isValidGstin, stateCode, toAmount } from "./fields";
import { cleanCompanyName, parseGstText } from "./parse";

const tally = readFileSync(join(__dirname, "fixtures", "tally-intra.txt"), "utf8");

describe("parseGstText on a Tally e-invoice (intra-state)", () => {
  const f = parseGstText(tally);

  it("reads the e-invoice block", () => {
    expect(f.docType).toBe("tax_invoice");
    expect(f.irn).toHaveLength(64);
    expect(f.irn.startsWith("c90e37009fd9196f")).toBe(true);
    expect(f.irn.endsWith("7387d74d")).toBe(true);
    expect(f.ackNo).toBe("162626609091776");
    expect(f.ackDate).toBe("2026-11-06");
  });

  it("reads the invoice number and date", () => {
    expect(f.invoiceNo).toBe("1868");
    expect(f.invoiceDate).toBe("2026-11-06");
  });

  it("reads the seller without Tally's financial-year suffix", () => {
    expect(f.sellerName).toBe("SHRI BALAJI INDUSTRIES");
    expect(f.sellerGstin).toBe("23ACGFS5752F1Z5");
    expect(f.sellerPan).toBe("ACGFS5752F");
    expect(f.sellerAddress).toBe("119/1, Sector -H, Industrial Area, Govindpura, Bhopal");
    expect(f.sellerState).toBe("Madhya Pradesh");
    expect(f.sellerEmail).toBe("sunilgupta98933@gmail.com");
  });

  it("reads the buyer and place of supply", () => {
    expect(f.buyerName).toBe("Bhim Energy Solutions");
    expect(f.buyerGstin).toBe("23CCYPS1427F1ZC");
    expect(f.placeOfSupply).toBe("23");
    expect(f.reverseCharge).toBe("no");
  });

  it("reads all seven lines, wrapped descriptions included", () => {
    expect(f.items).toHaveLength(7);
    expect(f.items[0]).toEqual({
      kind: "goods",
      description: "1cx4.00sqmm Lsoh Atc Cross Bsen -50618 BLACK Polycab",
      hsnSac: "85446090",
      quantity: "500",
      unit: "mtr",
      rate: "55",
      taxableValue: "27500",
      gstRate: "18",
    });
    expect(f.items[4]).toMatchObject({ description: "16 Sq mm Green Earthing Wire Alu.", quantity: "100", rate: "18", taxableValue: "1800" });
    expect(f.items[5]).toMatchObject({ description: "SS BOLT 10x25", hsnSac: "73181500", unit: "Nos", taxableValue: "6250" });
    expect(f.items[6]).toMatchObject({
      description: "ACDB-DCDB SET 1 TO 6KW COMBO (HAVELLS +SIGHTER)",
      hsnSac: "85371000",
      quantity: "1",
      rate: "1700",
      gstRate: "18",
    });
  });

  it("reads the totals across the page break", () => {
    expect(f.taxableValue).toBe("73650.00");
    expect(f.cgst).toBe("6628.50");
    expect(f.sgst).toBe("6628.50");
    expect(f.igst).toBe("");
    expect(f.total).toBe("86907.00");
  });

  it("balances, so no model is needed", () => {
    expect(checkBill(f, { ourGstins: ["23CCYPS1427F1ZC"], direction: "purchase" })).toEqual([]);
    expect(isComplete(f)).toBe(true);
  });
});

describe("parseGstText on other layouts", () => {
  const igstBill = `Tax Invoice
SUN POWER TRADERS
Plot 4, GIDC, Ahmedabad 380015
GSTIN/UIN: 24ABCDE1234F1Z5
State Name : Gujarat, Code : 24
Invoice No.
SPT/26-27/88
Dated
12-Nov-2026
Buyer (Bill to)
Bhim Energy Solutions
GSTIN/UIN : 23CCYPS1427F1ZC
Sl Description of Goods AmountperRateQuantityHSN/SAC
No.
1 Inverter 5kW On-Grid 40,000.00Nos.20,000.002.00 Nos.85044090
Freight Charges 1,000.00
41,000.00
IGST 7,380.00
Less : Round Off (-)0.00
Total 48,380.00
Amount Chargeable (in words)`;

  const f = parseGstText(igstBill);

  it("reads IGST and a freight line as a charge", () => {
    expect(f.sellerName).toBe("SUN POWER TRADERS");
    expect(f.sellerPincode).toBe("380015");
    expect(f.invoiceNo).toBe("SPT/26-27/88");
    expect(f.invoiceDate).toBe("2026-11-12");
    expect(f.items).toHaveLength(2);
    expect(f.items[1]).toMatchObject({ kind: "charge", description: "Freight Charges", taxableValue: "1000", gstRate: "18" });
    expect(f.items[0]!.gstRate).toBe("18");
    expect(f.taxableValue).toBe("41000.00");
    expect(f.igst).toBe("7380.00");
    expect(f.cgst).toBe("");
    expect(f.total).toBe("48380.00");
  });

  it("flags only the made-up GSTIN's check digit", () => {
    const codes = checkBill(f).map((i) => i.code);
    expect(codes).toEqual(["GSTIN_INVALID"]);
  });

  it("returns empty fields for empty text", () => {
    expect(parseGstText("").items).toEqual([]);
  });
});

describe("checkBill", () => {
  const base = parseGstText(tally);

  it("catches a total that does not add up", () => {
    const codes = checkBill({ ...base, total: "86000.00" }).map((i) => i.code);
    expect(codes).toContain("TOTAL");
  });

  it("catches IGST charged inside one state", () => {
    const codes = checkBill({ ...base, cgst: "", sgst: "", igst: "13257.00" }).map((i) => i.code);
    expect(codes).toContain("WRONG_HEAD");
  });

  it("catches a bill not addressed to us", () => {
    const codes = checkBill(base, { ourGstins: ["27AAAAA0000A1Z5"], direction: "purchase" }).map((i) => i.code);
    expect(codes).toContain("NOT_OURS");
  });
});

describe("helpers", () => {
  it("validates GSTIN check digits", () => {
    expect(isValidGstin("23ACGFS5752F1Z5")).toBe(true);
    expect(isValidGstin("23CCYPS1427F1ZC")).toBe(true);
    expect(isValidGstin("23CCYPS1427F1Z0")).toBe(false);
  });

  it("strips the financial year from a Tally company name", () => {
    expect(cleanCompanyName("SHRI BALAJI INDUSTRIES - 2026-2027 -")).toBe("SHRI BALAJI INDUSTRIES");
    expect(cleanCompanyName("ABC Traders (2025-26)")).toBe("ABC Traders");
    expect(cleanCompanyName("ABC Traders")).toBe("ABC Traders");
  });

  it("reads amounts and state codes", () => {
    expect(toAmount("(-)0.40")).toBe(-0.4);
    expect(toAmount("₹ 86,907.00")).toBe(86907);
    expect(stateCode("Madhya Pradesh")).toBe("23");
    expect(stateCode("29-Karnataka")).toBe("29");
  });
});
