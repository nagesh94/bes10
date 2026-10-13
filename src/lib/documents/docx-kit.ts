import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  type IParagraphOptions,
  type ISectionOptions,
  ImageRun,
  LevelFormat,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Building blocks for the generated DISCOM documents.
 *
 * These are official forms that go to a government portal and a DISCOM
 * counter, so the output has to match the supplied Word originals rather than
 * merely say the same things. Everything here is measured off those files:
 *
 *   font      Times New Roman throughout
 *   body      24 half-points (12pt); title 28 (14pt)
 *   sections  a numbered list whose first level is an upper letter — A., B.,
 *             C. — in bold, with decimal sub-items under it
 *   indents   section heading left 1080 hanging 720; sub-item left 1769
 *             hanging 776, in twentieths of a point
 *
 * Values merged from project data are bold, and on some forms also underlined,
 * because that is how the originals mark a filled blank.
 */

const TNR = "Times New Roman";

export const SIZE = { body: 24, small: 22, title: 28, big: 52 } as const;

/** Numbering ids, matching the originals' two lists. */
export const NUM = { sections: "sections", plain: "plain" } as const;

/**
 * Both list definitions every form uses.
 *
 * Passed to `new Document({ numbering })`. The lettered level is what gives
 * the work completion report its A. / B. / C. structure; `plain` is the flat
 * decimal list the enclosures and the ALMM clauses use.
 */
export const NUMBERING_CONFIG = {
  config: [
    {
      reference: NUM.sections,
      levels: [
        {
          level: 0,
          format: LevelFormat.UPPER_LETTER,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: {
            run: { bold: true, font: TNR, size: SIZE.body },
            paragraph: { indent: { left: 1080, hanging: 720 } },
          },
        },
        {
          level: 1,
          format: LevelFormat.DECIMAL,
          text: "%2.",
          alignment: AlignmentType.LEFT,
          style: {
            run: { bold: false, font: TNR, size: SIZE.body },
            paragraph: { indent: { left: 1769, hanging: 776 } },
          },
        },
      ],
    },
    {
      reference: NUM.plain,
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: {
            run: { font: TNR, size: SIZE.body },
            paragraph: { indent: { left: 1080, hanging: 720 } },
          },
        },
      ],
    },
  ],
};

/** A run of text in the document's font. */
export function run(
  text: string,
  opts: { bold?: boolean; underline?: boolean; italics?: boolean; size?: number; color?: string } = {},
) {
  return new TextRun({
    text,
    font: TNR,
    size: opts.size ?? SIZE.body,
    ...(opts.bold ? { bold: true } : {}),
    ...(opts.italics ? { italics: true } : {}),
    ...(opts.underline ? { underline: { type: "single" as const } } : {}),
    ...(opts.color ? { color: opts.color } : {}),
  });
}

/**
 * One segment of a mixed-formatting line.
 *
 * These forms constantly read "label: **value**" inside a flowing sentence —
 * the DCR undertaking's opening paragraph alone has five merged values inside
 * one sentence — so a paragraph is built from segments rather than from a
 * single string.
 */
export interface Seg {
  text: string;
  bold?: boolean;
  underline?: boolean;
  italics?: boolean;
  size?: number;
}

/** Marks a merged value: bold, and underlined on the forms that do that. */
export function value(
  text: string | null | undefined,
  opts: { underline?: boolean; fallback?: string } = {},
): Seg {
  const shown = text === null || text === undefined || String(text).trim() === ""
    ? (opts.fallback ?? BLANK)
    : String(text);
  return { text: shown, bold: true, ...(opts.underline ? { underline: true } : {}) };
}

export const BLANK = "________________";

export function rich(segments: Seg[], opts: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    ...opts,
    children: segments.map((s) =>
      run(s.text, {
        ...(s.bold === undefined ? {} : { bold: s.bold }),
        ...(s.underline === undefined ? {} : { underline: s.underline }),
        ...(s.italics === undefined ? {} : { italics: s.italics }),
        ...(s.size === undefined ? {} : { size: s.size }),
      }),
    ),
  });
}

export function body(text: string, opts: Partial<IParagraphOptions> = {}): Paragraph {
  return rich([{ text }], opts);
}

/** Justified body text, which is how the originals set their paragraphs. */
export function justified(segments: Seg[], opts: Partial<IParagraphOptions> = {}): Paragraph {
  return rich(segments, { alignment: AlignmentType.JUSTIFIED, ...opts });
}

export function centred(segments: Seg[], opts: Partial<IParagraphOptions> = {}): Paragraph {
  return rich(segments, { alignment: AlignmentType.CENTER, ...opts });
}

/** The document title: 14pt, bold, underlined, centred. */
export function title(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 39, after: 240, line: 276 },
    children: [run(text, { bold: true, underline: true, size: SIZE.title })],
  });
}

/** "Annexure-I" — top right, bold, above the title. */
export function annexure(text: string, underline = true): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 160 },
    children: [run(text, { bold: true, underline })],
  });
}

export function blankLine(after = 120): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

/** A lettered section heading — A., B., C. — bold. */
export function sectionHeading(segments: Seg[], opts: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({
    numbering: { reference: NUM.sections, level: 0 },
    spacing: { before: 160, after: 60, line: 276 },
    ...opts,
    children: segments.map((s) => run(s.text, { bold: s.bold ?? true, ...(s.underline ? { underline: true } : {}) })),
  });
}

/** A decimal sub-item under a lettered section. */
export function subItem(segments: Seg[], opts: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({
    numbering: { reference: NUM.sections, level: 1 },
    spacing: { after: 45, line: 276 },
    ...opts,
    children: segments.map((s) =>
      run(s.text, { ...(s.bold ? { bold: true } : {}), ...(s.underline ? { underline: true } : {}) }),
    ),
  });
}

/** A flat decimal list item, e.g. the enclosures. */
export function listItem(segments: Seg[], opts: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({
    numbering: { reference: NUM.plain, level: 0 },
    spacing: { after: 45, line: 276 },
    alignment: AlignmentType.JUSTIFIED,
    ...opts,
    children: segments.map((s) => run(s.text, { ...(s.bold ? { bold: true } : {}) })),
  });
}

/** "label: value" as its own numbered-by-hand paragraph, e.g. "1. Name: X". */
export function numberedLine(
  n: number | string,
  label: string,
  val: string | null | undefined,
  opts: { underline?: boolean; separator?: string; fallback?: string } = {},
): Paragraph {
  return rich([
    { text: `${n}. ${label}${opts.separator ?? ": "}` },
    value(val, {
      ...(opts.underline === undefined ? {} : { underline: opts.underline }),
      ...(opts.fallback === undefined ? {} : { fallback: opts.fallback }),
    }),
  ]);
}

const THIN = { style: BorderStyle.SINGLE, size: 6, color: "000000" } as const;
const CELL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN } as const;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER } as const;

export interface CellSpec {
  segments?: Seg[];
  text?: string;
  bold?: boolean;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  width?: number;
  /** Several paragraphs in one cell, as the earthing table's row 3 needs. */
  lines?: string[];
  image?: SignatureImage;
  rowSpan?: number;
  /** A table inside the cell, for the DCR undertaking's two-up footer. */
  nested?: Table;
  /** Ready-made paragraphs, when the cell needs mixed formatting per line. */
  paragraphs?: Paragraph[];
}

function buildCell(spec: CellSpec, bordered: boolean, dense = false): TableCell {
  const children: Array<Paragraph | Table> = [];

  if (spec.nested) children.push(spec.nested);
  if (spec.paragraphs) children.push(...spec.paragraphs);

  if (spec.image) {
    children.push(
      new Paragraph({
        alignment: spec.align ?? AlignmentType.LEFT,
        spacing: { after: 0 },
        children: [
          new ImageRun({
            type: "png",
            data: spec.image.png,
            transformation: { width: spec.image.width, height: spec.image.height },
          }),
        ],
      }),
    );
  }

  const lines = spec.lines ?? (spec.segments || spec.text !== undefined ? [null] : []);
  for (const line of lines) {
    const segments: Seg[] =
      line === null
        ? (spec.segments ?? [{ text: spec.text ?? "", ...(spec.bold ? { bold: true } : {}) }])
        : [{ text: line, ...(spec.bold ? { bold: true } : {}) }];
    children.push(
      new Paragraph({
        // Tight: the originals' table rows are a single line high. `dense`
        // goes tighter still, for the module serial list — nine rows of it
        // otherwise pushed the DCR undertaking's closing block onto a second
        // page that the original does not have.
        spacing: dense ? { before: 0, after: 0, line: 240 } : { before: 10, after: 10, line: 264 },
        ...(spec.align === undefined ? {} : { alignment: spec.align }),
        children: segments.map((s) =>
          run(s.text, {
            ...(s.bold ? { bold: true } : {}),
            ...(s.underline ? { underline: true } : {}),
            ...(dense ? { size: SIZE.small } : {}),
          }),
        ),
      }),
    );
  }

  // Word requires a cell to end with a paragraph; a cell whose last child is
  // a table renders corrupt without one.
  if (children.length === 0 || children[children.length - 1] instanceof Table) {
    children.push(new Paragraph({ children: [] }));
  }

  return new TableCell({
    borders: bordered ? CELL_BORDERS : NO_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(spec.width === undefined ? {} : { width: { size: spec.width, type: WidthType.PERCENTAGE } }),
    ...(spec.rowSpan === undefined ? {} : { rowSpan: spec.rowSpan }),
    children,
  });
}

export function table(
  rows: CellSpec[][],
  opts: { bordered?: boolean; widthPercent?: number; cantSplit?: boolean; dense?: boolean } = {},
): Table {
  const bordered = opts.bordered ?? true;
  return new Table({
    width: { size: opts.widthPercent ?? 100, type: WidthType.PERCENTAGE },
    ...(bordered ? {} : { borders: { insideHorizontal: NO_BORDER, insideVertical: NO_BORDER, ...NO_BORDERS } }),
    rows: rows.map(
      (cells) =>
        new TableRow({
          ...(opts.cantSplit ? { cantSplit: true } : {}),
          children: cells.map((c) => buildCell(c, bordered, opts.dense ?? false)),
        }),
    ),
  });
}

/**
 * A numbered detail table: "1. | label | value".
 *
 * The earthing and net meter blocks are both built this way in the original,
 * with the number centred in a narrow first column. A row with no value
 * prints an empty cell, which is deliberate — the net meter is fitted and
 * lab-tested by the DISCOM after this report goes in, so those seven rows are
 * meant to be filled by hand at the counter.
 */
export function numberedTable(
  rows: Array<{ label: string | string[]; value?: string | null }>,
): Table {
  return table(
    rows.map((r, i) => [
      { text: `${i + 1}.`, align: AlignmentType.CENTER, width: 7 },
      Array.isArray(r.label) ? { lines: r.label, width: 55 } : { text: r.label, width: 55 },
      { text: r.value ?? "", width: 38 },
    ]),
  );
}

export type SignatureImage = { png: Buffer; width: number; height: number } | null;

/**
 * Normalises a signature image for embedding.
 *
 * Signatures arrive as a phone photo or a scan, so they are the wrong size
 * and usually on an off-white background. This flattens them onto white,
 * trims the border away, and resamples to the size it will print at —
 * embedding the original 1080px photo made each document about half a
 * megabyte for a signature two centimetres wide.
 *
 * Returns null rather than throwing: a signature that will not decode must
 * not stop the document being produced, it just leaves a blank to sign.
 */
export async function prepareSignature(
  input: Buffer,
  opts: { printedHeight?: number; maxWidth?: number } = {},
): Promise<SignatureImage> {
  const printedHeight = opts.printedHeight ?? 52;
  const maxWidth = opts.maxWidth ?? 190;
  try {
    const sharp = (await import("sharp")).default;
    const trimmed = await sharp(input)
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .trim({ threshold: 18 })
      .png()
      .toBuffer();

    const meta = await sharp(trimmed).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return null;

    const ratio = w / h;
    let height = printedHeight;
    let width = Math.round(height * ratio);
    if (width > maxWidth) {
      width = maxWidth;
      height = Math.round(width / ratio);
    }

    const png = await sharp(trimmed)
      .resize({ width: width * 4, height: height * 4, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    return { png, width, height };
  } catch {
    return null;
  }
}

const brandPath = (file: string) => path.join(process.cwd(), "public", "brand", file);

/** The vendor's signature and seal, which never changes. */
export async function loadVendorSignature(): Promise<SignatureImage> {
  try {
    return await prepareSignature(await readFile(brandPath("vendor-seal-signature.jpg")), {
      printedHeight: 56,
      maxWidth: 200,
    });
  } catch {
    return null;
  }
}

export interface VendorIdentity {
  name: string;
  addressLine: string;
  city: string;
  pinCode: string;
  phones: string;
  email: string;
  gstin: string | null;
  signatoryName: string;
  signatoryDesignation: string;
  signatoryPhone: string | null;
  /** How the address is written on the forms, over several short lines. */
  addressLines: string[];
}

const NAVY = "0B2A5B";

/**
 * The company letterhead, as a docx header and footer.
 *
 * Reproduces the supplied LetterHead.pdf: emblem at the left, the company
 * name and contact block beside it, the GSTIN alone on the right, a navy rule
 * under the header, a faded emblem watermark behind the page, and a navy
 * address bar across the foot.
 *
 * Only the ALMM declaration uses this. The others are DISCOM forms that carry
 * the DISCOM's own heading, and putting our emblem on them would be wrong.
 */
export async function letterheadSection(
  vendor: VendorIdentity,
): Promise<Pick<ISectionOptions, "headers" | "footers">> {
  let emblem: Buffer | null = null;
  let watermark: Buffer | null = null;
  try {
    emblem = await readFile(brandPath("bhim-emblem.png"));
    const sharp = (await import("sharp")).default;
    // Faded to roughly the 8% ink of the original's watermark, flattened onto
    // white because Word will not apply opacity to an embedded image.
    watermark = await sharp(emblem)
      .resize({ width: 1400, withoutEnlargement: true })
      .composite([
        {
          input: { create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.9 } } },
          tile: true,
          blend: "over",
        },
      ])
      .png()
      .toBuffer();
  } catch {
    // No emblem: the text header below still carries the identity.
  }

  const headerTable = table(
    [
      [
        {
          width: 22,
          ...(emblem
            ? {
                image: {
                  png: emblem,
                  width: 104,
                  height: 104,
                },
              }
            : { text: "" }),
        },
        {
          width: 78,
          segments: [{ text: "" }],
        },
      ],
    ],
    { bordered: false },
  );

  const headerParagraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [run(vendor.name.toUpperCase(), { bold: true, size: SIZE.big, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [run(`Mobile: ${vendor.phones}`, { size: SIZE.body })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        run("Email: ", { size: SIZE.body }),
        run(vendor.email, { size: SIZE.body, underline: true, color: "1155CC" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: NAVY, space: 6 } },
      children: [run(vendor.gstin ?? "", { size: SIZE.small })],
    }),
  ];

  // The emblem sits beside the text block, so the two go in one borderless
  // row rather than stacked.
  const header = new Header({
    children: [
      ...(emblem
        ? [
            new Paragraph({
              spacing: { before: 0, after: 0, line: 1, lineRule: "exact" as const },
              children: [
                new ImageRun({
                  type: "png",
                  data: emblem,
                  transformation: { width: 104, height: 104 },
                  floating: {
                    horizontalPosition: { relative: "margin", offset: 0 },
                    verticalPosition: { relative: "paragraph", offset: 0 },
                    behindDocument: false,
                    zIndex: 1,
                  },
                }),
              ],
            }),
          ]
        : []),
      ...headerParagraphs,
      // The watermark is anchored to the page and sits behind the text, so
      // its paragraph must contribute no height of its own — giving it any
      // spacing grows the header band and pushes the body a third of the way
      // down the sheet.
      ...(watermark
        ? [
            new Paragraph({
              spacing: { before: 0, after: 0, line: 1, lineRule: "exact" as const },
              children: [
                new ImageRun({
                  type: "png",
                  data: watermark,
                  transformation: { width: 430, height: 430 },
                  floating: {
                    horizontalPosition: { relative: "page", align: "center" },
                    verticalPosition: { relative: "page", align: "center" },
                    behindDocument: true,
                    zIndex: -1,
                  },
                }),
              ],
            }),
          ]
        : []),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        shading: { type: ShadingType.CLEAR, fill: NAVY, color: "auto" },
        children: [
          run(`Address: ${vendor.addressLine}, ${vendor.city} ${vendor.pinCode}`, {
            size: SIZE.body,
            color: "FFFFFF",
          }),
        ],
      }),
    ],
  });

  void headerTable;
  return { headers: { default: header }, footers: { default: footer } };
}

/** A4 with the originals' one-inch margins. */
export const PAGE = {
  page: {
    size: { width: 11906, height: 16838 },
    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  },
} as const;

/** A4 with room for the letterhead's header and footer bands. */
export const PAGE_LETTERHEAD = {
  page: {
    size: { width: 11906, height: 16838 },
    margin: { top: 2600, right: 1200, bottom: 1400, left: 1200, header: 560, footer: 340 },
  },
} as const;

export function formatDate(d: Date | string | null | undefined, sep: "/" | "-" = "/"): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${sep}${mm}${sep}${date.getFullYear()}`;
}

/** "17-Sept-2026", which is how the DCR undertaking writes its PO date. */
export function formatDateLong(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

/** Indian grouping, the way every one of these forms writes an amount. */
export function rupees(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN")}/-`;
}

export { AlignmentType };
