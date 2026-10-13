import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFImage } from "pdf-lib";
import sharp from "sharp";
import { A4, COLORS, drawTable, PdfDoc, type Cell, type Run } from "@/lib/pdf/layout";
import {
  ASSUMPTIONS,
  capacityWord,
  EXCLUDED_TEXT,
  inr,
  type ItemDraft,
  MATERIAL_HEADER,
  type MilestoneDraft,
  NOTE_TEXT,
  SCOPE_HEADER,
  SCOPE_ROWS,
  type ScopeRow,
  SOLAR_ENERGY_PARAGRAPHS,
  SOLAR_ENERGY_SOLUTIONS,
  subjectLine,
  summaryTail,
  type SystemType,
  TERMS_LINE,
  WARRANTY,
} from "./content";

/**
 * The quotation, as the PDF the customer receives.
 *
 * Laid out against the file the office has been sending for years — the same
 * letterhead, the same orange rule, the same faint wordmark behind the text,
 * the same section order. A customer comparing this with an older quotation
 * should see one document, not two.
 *
 * Nothing here reads the database. It takes a snapshot and returns bytes,
 * which is what lets the whole layout be checked by generating a file and
 * looking at it, with no project and no login.
 */

export interface QuotationDoc {
  number: string;
  date: Date;
  consumer: {
    title?: string | null;
    name: string;
    address?: string | null;
    phone?: string | null;
  };
  capacityKwp: number | string;
  systemType: SystemType;
  meteringPolicy: string;
  totalAmount: number;
  vendor: {
    name: string;
    address: string;
    phones: string;
    email: string;
    gstin?: string | null;
  };
  bank: {
    name?: string | null;
    accountNo?: string | null;
    ifsc?: string | null;
    accountType?: string | null;
  } | null;
  signatoryName: string;
  notes?: string | null;
  scope?: readonly ScopeRow[];
  items: readonly ItemDraft[];
  milestones: readonly MilestoneDraft[];
  /** Names the metering scheme in the Project Summary. */
  stateName?: string;
}

/** "15-06-26", exactly as the original dates itself. */
function shortDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/**
 * The two brand images, loaded once per process.
 *
 * The wordmark is trimmed before use: the asset is a square with a wide
 * transparent margin, and placing it untrimmed would put a small mark in the
 * middle of the page instead of the broad watermark the original has.
 */
let assetCache: { watermark: Buffer; logo: Buffer } | null = null;

async function brandAssets(): Promise<{ watermark: Buffer; logo: Buffer }> {
  if (assetCache) return assetCache;

  const dir = path.join(process.cwd(), "public", "brand");
  const [wordmark, logo] = await Promise.all([
    readFile(path.join(dir, "bhim-wordmark.png")),
    readFile(path.join(dir, "bhim-emblem.png")),
  ]);

  let watermark = wordmark;
  try {
    watermark = await sharp(wordmark).trim().png().toBuffer();
  } catch {
    // An asset that will not trim still works untrimmed — a smaller
    // watermark is not worth failing a customer's quotation over.
  }

  assetCache = { watermark, logo };
  return assetCache;
}

export async function buildQuotationPdf(data: QuotationDoc): Promise<Buffer> {
  const { watermark, logo } = await brandAssets();

  const doc = await PdfDoc.create({
    margin: { top: 44, right: 50, bottom: 50, left: 50 },
    baseSize: 11,
  });

  const watermarkImage = await doc.pdf.embedPng(watermark);
  const logoImage = await doc.pdf.embedPng(logo);

  doc.setWatermark({ image: watermarkImage, widthRatio: 0.88, opacity: 0.085 });

  letterhead(doc, data, logoImage);

  // ── Reference block ──
  doc.paragraph([{ text: `Q.No. -${data.number}`, bold: true, size: 11.5 }], {
    align: "right",
    spaceAfter: 10,
  });

  // "To," and the date share a line but sit at opposite margins, so both are
  // drawn at the same top and the cursor is moved once afterwards.
  const salutationTop = doc.y;
  const toLines = doc.wrap([{ text: "To,", bold: true, size: 11.5 }], doc.contentWidth, {
    size: 11.5,
  });
  doc.drawLines(toLines, doc.margin.left + 4, salutationTop, doc.contentWidth, "left");
  doc.drawLines(
    doc.wrap([{ text: `Date : ${shortDate(data.date)}`, bold: true, size: 11.5 }], doc.contentWidth, {
      size: 11.5,
    }),
    doc.margin.left,
    salutationTop,
    doc.contentWidth,
    "right",
  );
  doc.y = salutationTop + (toLines[0]?.height ?? 15) + 12;

  const consumerFull = [data.consumer.title, data.consumer.name]
    .filter(Boolean)
    .join(" ")
    .trim();
  doc.paragraph([{ text: `Consumer Name : ${consumerFull}`, bold: true, size: 11.5 }], {
    spaceAfter: 10,
  });

  doc.paragraph(
    [
      { text: "Subject: ", bold: true, size: 11.5 },
      {
        text: subjectLine(data.capacityKwp, data.systemType, data.meteringPolicy),
        bold: true,
        size: 11.5,
      },
    ],
    { align: "justify", spaceAfter: 10 },
  );

  doc.paragraph("Dear Sir,", { spaceAfter: 2 });

  doc.paragraph(
    [
      { text: "We, " },
      { text: `M/s ${data.vendor.name}`, bold: true },
      {
        text: ` having office at ${data.vendor.address}. We are engaged in Roof Top Solar installation work. We are associated with Residential Roof Top System and Commercial Roof Top System installation.`,
      },
    ],
    { align: "justify", spaceAfter: 10 },
  );

  doc.paragraph(
    [
      {
        text: "This is with reference to above subjected matter we are looking forward for installation ",
      },
      { text: capacityWord(data.capacityKwp), bold: true },
      { text: " Solar Plant at your Premises under " },
      { text: `${data.stateName ?? "Madhya Pradesh"} net metering arrangement.` },
      { text: " The proposal consists of introduction of " },
      { text: `M/ ${data.vendor.name}`, bold: true },
      {
        text: " along with techno – commercial offer for Erection, Procurement & commissioning (EPC) .",
      },
    ],
    { align: "justify", spaceAfter: 6 },
  );

  // ── Project scope ──
  doc.heading("Project Scope:");
  const scope = data.scope ?? SCOPE_ROWS;
  drawTable(doc, {
    cols: [148, 150, 97, 100].map((n) => (n / 495) * doc.contentWidth),
    rows: [
      SCOPE_HEADER.map((label) => ({ runs: label })) as Cell[],
      ...scope.map(
        (row): Cell[] => [
          { runs: row.section },
          { runs: row.details },
          { check: row.byBhim },
          { check: row.byCustomer },
        ],
      ),
    ],
  });

  // ── Solar energy ──
  doc.space(12);
  doc.label("Solar Energy:", { spaceAfter: 8, keepWith: 60 });
  doc.bullets(
    SOLAR_ENERGY_PARAGRAPHS.map((text) => [{ text }] as Run[]),
    { align: "justify", itemGap: 10, gutter: 12, indent: 2 },
  );

  doc.heading("Solar Energy Solutions:");
  doc.bullets([...SOLAR_ENERGY_SOLUTIONS], { indent: 10, itemGap: 2 });

  doc.heading("Assumptions:");
  doc.bullets([...ASSUMPTIONS], { indent: 10, itemGap: 2 });

  doc.heading("Project Summary:");
  doc.bullets(
    [
      [
        { text: "The proposed capacity of Solar Plant " },
        { text: capacityWord(data.capacityKwp), bold: true },
      ] as Run[],
      ...summaryTail(data.stateName).map((text) => [{ text }] as Run[]),
      ...(data.notes ? [[{ text: data.notes }] as Run[]] : []),
    ],
    { indent: 10, itemGap: 3, align: "justify" },
  );

  // ── Material description ──
  doc.heading("Material Description:");
  drawTable(doc, {
    cols: [68, 110, 80, 98, 139].map((n) => (n / 495) * doc.contentWidth),
    rows: [
      MATERIAL_HEADER.map((label) => ({ runs: label })) as Cell[],
      ...data.items.map((item, index): Cell[] => [
        { runs: String(index + 1) },
        { runs: item.description },
        { runs: item.qty ?? "" },
        { runs: item.make ?? "" },
        { runs: item.remark ?? "" },
      ]),
    ],
  });

  // ── Project cost ──
  doc.heading("Project Cost:");
  drawTable(doc, {
    cols: [0.6, 0.4].map((f) => f * doc.contentWidth),
    rows: [
      [{ runs: "Particulars" }, { runs: "Price (Rs.)" }],
      [
        { runs: "Total Payable Amount" },
        { runs: [{ text: `${inr(data.totalAmount)}/-`, bold: true, size: 15 }] },
      ],
    ],
  });

  // ── Payment schedule ──
  doc.heading("Payment Schedule:");
  drawTable(doc, {
    cols: [0.6, 0.4].map((f) => f * doc.contentWidth),
    rows: [
      [{ runs: "Details" }, { runs: "Price Schedule" }],
      ...data.milestones.map((m): Cell[] => [{ runs: m.label }, { runs: m.schedule }]),
    ],
  });

  // ── Bank details ──
  if (data.bank && (data.bank.name || data.bank.accountNo)) {
    doc.heading("Bank Details:");
    const rows: Array<[string, string | null | undefined]> = [
      ["Bank Name", data.bank.name],
      ["Account No", data.bank.accountNo],
      ["IFSC", data.bank.ifsc],
      ["Account Type", data.bank.accountType],
    ];
    drawTable(doc, {
      cols: [0.46, 0.54].map((f) => f * doc.contentWidth),
      rows: rows
        .filter(([, value]) => Boolean(value))
        .map(([label, value]): Cell[] => [{ runs: label }, { runs: value ?? "" }]),
    });
  }

  // ── Note, exclusions, warranty ──
  doc.space(12);
  doc.label("Note:", { keepWith: 46 });
  doc.paragraph(NOTE_TEXT, { align: "justify", spaceAfter: 12 });

  doc.label("Excluded from Price:", { keepWith: 46 });
  doc.paragraph(EXCLUDED_TEXT, { align: "justify", spaceAfter: 4 });

  doc.heading("Warranty:");
  doc.bullets([...WARRANTY], { indent: 10, itemGap: 3, align: "justify" });

  doc.space(2);
  doc.paragraph([{ text: TERMS_LINE, italic: true, size: 10 }], { spaceAfter: 14 });

  doc.ensure(60);
  doc.paragraph("Thanks & Regards,", { spaceAfter: 0 });
  doc.paragraph(data.signatoryName, { spaceAfter: 14 });
  doc.paragraph(data.vendor.name.toUpperCase(), { spaceAfter: 0 });

  return doc.save();
}

/**
 * The letterhead: emblem on the left, company block beside it, orange rule
 * across the full width of the page.
 *
 * Page 1 only. The original does not repeat it, and a quotation whose later
 * pages suddenly grew a header would not match the ones already filed.
 */
function letterhead(doc: PdfDoc, data: QuotationDoc, logo: PDFImage): void {
  const top = doc.y;
  const logoSize = 92;

  doc.page.drawImage(logo, {
    x: doc.margin.left + 8,
    y: A4.height - top - logoSize,
    width: logoSize,
    height: logoSize,
  });

  const textLeft = doc.margin.left + logoSize + 30;
  const textWidth = A4.width - doc.margin.right - textLeft;

  let cursor = top + 6;
  cursor += doc.drawLines(
    doc.wrap([{ text: data.vendor.name.toUpperCase(), bold: true, size: 17 }], textWidth, {
      size: 17,
    }),
    textLeft,
    cursor,
    textWidth,
  );
  cursor += 5;

  const lines: string[] = [
    data.vendor.address,
    `Contact No: ${data.vendor.phones}`,
    `Email: ${data.vendor.email}`,
    ...(data.vendor.gstin ? [`GST: ${data.vendor.gstin}`] : []),
  ];

  for (const line of lines) {
    cursor += doc.drawLines(
      doc.wrap([{ text: line, sans: true, size: 10.5 }], textWidth, { size: 10.5, leading: 1.55 }),
      textLeft,
      cursor,
      textWidth,
    );
  }

  // The orange rule bleeds off both edges on the original, so it is drawn
  // past the margins rather than inside them.
  const ruleTop = Math.max(cursor + 10, top + logoSize + 6);
  doc.page.drawRectangle({
    x: -4,
    y: A4.height - ruleTop - 9,
    width: A4.width + 8,
    height: 9,
    color: COLORS.orange,
  });

  doc.y = ruleTop + 9 + 18;
}
