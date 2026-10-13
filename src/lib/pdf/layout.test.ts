import { describe, expect, it } from "vitest";
import { PdfDoc, sanitize } from "./layout";

/**
 * The standard-14 fonts encode WinAnsi and pdf-lib throws — rather than
 * dropping the character — on anything outside it. Every string that reaches
 * a page goes through `sanitize` for that reason, so these are the cases
 * that would otherwise fail a customer's quotation at save time.
 */
describe("sanitize keeps the text inside what the font can encode", () => {
  it("leaves ordinary text alone", () => {
    expect(sanitize("Solar Panel 540w Monocot Bifacial")).toBe(
      "Solar Panel 540w Monocot Bifacial",
    );
  });

  it("keeps the characters the original quotation actually uses", () => {
    expect(sanitize("tilt angle between 12° to 16°")).toContain("°");
    expect(sanitize("techno – commercial")).toContain("–");
    expect(sanitize("• bullet")).toContain("•");
  });

  it("spells out the rupee sign, which WinAnsi has no glyph for", () => {
    expect(sanitize("₹2,20,000")).toBe("Rs.2,20,000");
  });

  it("drops what cannot be drawn rather than throwing", () => {
    expect(sanitize("Chanda गिरी Giri")).toBe("Chanda  Giri");
    expect(sanitize("emoji \u{1F600} here")).toBe("emoji  here");
  });

  it("normalises the characters a paste from elsewhere brings in", () => {
    expect(sanitize("non breaking")).toBe("non breaking");
    expect(sanitize("non‑breaking")).toBe("non-breaking");
  });
});

describe("word wrap", () => {
  it("breaks a long line into several and keeps every word", async () => {
    const doc = await PdfDoc.create();
    const text = "The maximum shadow free area per KWP required is 180 Sq ft".repeat(4);
    const lines = doc.wrap([{ text }], 200, { size: 11 });

    expect(lines.length).toBeGreaterThan(1);
    const words = lines.flatMap((line) => line.tokens.map((t) => t.text)).join(" ");
    expect(words.replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("keeps every line inside the width it was given", async () => {
    const doc = await PdfDoc.create();
    const lines = doc.wrap(
      [{ text: "Design for maximum energy Generation and Wind Speed across the roof" }],
      150,
      { size: 10.5 },
    );
    for (const line of lines) expect(line.width).toBeLessThanOrEqual(150);
  });

  it("honours an explicit newline inside a run", async () => {
    const doc = await PdfDoc.create();
    const lines = doc.wrap([{ text: "first\nsecond" }], 400, { size: 11 });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.tokens[0]?.text).toBe("first");
    expect(lines[1]?.tokens[0]?.text).toBe("second");
  });

  it("measures a bold run wider than the same text plain", async () => {
    const doc = await PdfDoc.create();
    const plain = doc.wrap([{ text: "BHIM ENERGY SOLUTIONS" }], 500, { size: 11 });
    const bold = doc.wrap([{ text: "BHIM ENERGY SOLUTIONS", bold: true }], 500, { size: 11 });
    expect(bold[0]!.width).toBeGreaterThan(plain[0]!.width);
  });
});

describe("page breaks", () => {
  it("starts a new page when the cursor runs past the bottom margin", async () => {
    const doc = await PdfDoc.create();
    expect(doc.pageCount).toBe(1);

    doc.y = doc.bottomLimit - 5;
    doc.ensure(40);
    expect(doc.pageCount).toBe(2);
    expect(doc.y).toBe(doc.margin.top);
  });

  it("does not break when what is coming still fits", async () => {
    const doc = await PdfDoc.create();
    doc.ensure(40);
    expect(doc.pageCount).toBe(1);
  });

  it("flows a paragraph longer than a page across pages", async () => {
    const doc = await PdfDoc.create();
    const long = "Every kilowatt of solar plant can reduce up to 3000 pounds of CO2. ".repeat(
      120,
    );
    doc.paragraph(long, { align: "justify" });
    expect(doc.pageCount).toBeGreaterThan(1);
  });
});
