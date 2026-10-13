import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from "pdf-lib";

/**
 * A small flowing-layout layer over pdf-lib.
 *
 * pdf-lib draws a string at a coordinate and nothing more: it has no concept
 * of a line, a paragraph, a page break or a table. The quotation is four
 * pages of wrapped, justified prose and bordered tables that break across
 * pages, so that machinery has to exist somewhere. It lives here rather than
 * in the quotation builder so the builder reads like the document it
 * produces.
 *
 * Why generate rather than fill a template: the quotation's tables grow and
 * shrink with the job — a 3 kW roof and a 10 kW roof have different line
 * counts — so there is no fixed form to overlay. The output is a PDF rather
 * than a .docx (unlike the vendor agreement) because this one is sent and
 * printed as-is, never edited by a third party.
 *
 * Everything is measured in PostScript points, origin bottom-left, which is
 * pdf-lib's own coordinate system. `y` here is the TOP of the next thing to
 * be drawn, counting down the page, because that is how a document is read.
 */

export type RGBColor = ReturnType<typeof rgb>;

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Helvetica instead of Times — the letterhead address lines only. */
  sans?: boolean;
  size?: number;
  color?: RGBColor;
  underline?: boolean;
}

export type Align = "left" | "center" | "right" | "justify";

export interface TextOptions {
  align?: Align;
  size?: number;
  /** Multiplier on the font size. 1.32 reads like Word's "single". */
  leading?: number;
  spaceAfter?: number;
  spaceBefore?: number;
  indent?: number;
  color?: RGBColor;
}

export const A4 = { width: 595.28, height: 841.89 } as const;

export const COLORS = {
  ink: rgb(0, 0, 0),
  heading: rgb(0.18, 0.45, 0.71),
  orange: rgb(0.961, 0.51, 0.122),
  line: rgb(0, 0, 0),
  muted: rgb(0.35, 0.35, 0.35),
} as const;

/**
 * The standard-14 fonts encode WinAnsi, and pdf-lib throws on any codepoint
 * outside it rather than dropping the character. A consumer name pasted from
 * WhatsApp carrying a non-breaking hyphen would otherwise fail the whole
 * generation, so everything is filtered on the way in.
 *
 * The rupee sign is spelled out because WinAnsi has no glyph for it — which
 * is also why the original quotation says "Rs." throughout.
 */
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const ALLOWED = new RegExp(`[^\\x20-\\x7E\\xA0-\\xFF${WINANSI_EXTRA}]`, "g");

export function sanitize(input: string): string {
  return input
    .replace(/₹/g, "Rs.")
    .replace(/ /g, " ")
    .replace(/[‐‑]/g, "-")
    .replace(/\t/g, "    ")
    .replace(ALLOWED, "")
    .trimEnd();
}

interface Token {
  text: string;
  font: PDFFont;
  size: number;
  color: RGBColor;
  width: number;
  underline: boolean;
  /** A token that ends a line regardless of remaining width. */
  br?: boolean;
}

export interface Line {
  tokens: Token[];
  /** Sum of token widths plus one space between each. */
  width: number;
  spaces: number;
  height: number;
}

export interface PdfDocOptions {
  margin?: { top: number; right: number; bottom: number; left: number };
  /** Drawn faint and centred on every page before any content. */
  watermark?: { image: PDFImage; widthRatio?: number; opacity?: number } | null;
  baseSize?: number;
  leading?: number;
}

export class PdfDoc {
  readonly pdf: PDFDocument;
  readonly times: PDFFont;
  readonly timesBold: PDFFont;
  readonly timesItalic: PDFFont;
  readonly timesBoldItalic: PDFFont;
  readonly helv: PDFFont;
  readonly helvBold: PDFFont;

  readonly margin: { top: number; right: number; bottom: number; left: number };
  readonly baseSize: number;
  readonly baseLeading: number;
  private watermark: PdfDocOptions["watermark"];

  page!: PDFPage;
  /** Distance from the top of the page to the next thing drawn. */
  y = 0;
  pageCount = 0;

  private constructor(pdf: PDFDocument, fonts: PDFFont[], opts: PdfDocOptions) {
    this.pdf = pdf;
    [this.times, this.timesBold, this.timesItalic, this.timesBoldItalic, this.helv, this.helvBold] =
      fonts as [PDFFont, PDFFont, PDFFont, PDFFont, PDFFont, PDFFont];
    this.margin = opts.margin ?? { top: 48, right: 56, bottom: 52, left: 56 };
    this.baseSize = opts.baseSize ?? 11;
    this.baseLeading = opts.leading ?? 1.32;
    this.watermark = opts.watermark ?? null;
  }

  static async create(opts: PdfDocOptions = {}): Promise<PdfDoc> {
    const pdf = await PDFDocument.create();
    const fonts = await Promise.all([
      pdf.embedFont(StandardFonts.TimesRoman),
      pdf.embedFont(StandardFonts.TimesRomanBold),
      pdf.embedFont(StandardFonts.TimesRomanItalic),
      pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
      pdf.embedFont(StandardFonts.Helvetica),
      pdf.embedFont(StandardFonts.HelveticaBold),
    ]);
    const doc = new PdfDoc(pdf, fonts, opts);
    doc.newPage();
    return doc;
  }

  get contentWidth(): number {
    return A4.width - this.margin.left - this.margin.right;
  }

  get bottomLimit(): number {
    return A4.height - this.margin.bottom;
  }

  /** pdf-lib wants a baseline from the bottom; the layout counts from the top. */
  private baselineFor(top: number, size: number): number {
    return A4.height - top - size;
  }

  newPage(): void {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.pageCount += 1;
    this.y = this.margin.top;
    this.paintWatermark();
  }

  private paintWatermark(): void {
    if (!this.watermark) return;
    const { image, widthRatio = 0.86, opacity = 0.09 } = this.watermark;
    const w = A4.width * widthRatio;
    const h = (image.height / image.width) * w;
    this.page.drawImage(image, {
      x: (A4.width - w) / 2,
      y: (A4.height - h) / 2,
      width: w,
      height: h,
      opacity,
    });
  }

  /**
   * Set the watermark after the document exists.
   *
   * An image has to be embedded into a PDFDocument before it can be drawn,
   * and the document is only created inside `create` — so the first page is
   * already open by the time a caller has an image to hand. This paints it
   * onto that page too, which is why it is a method and not a field.
   */
  setWatermark(mark: NonNullable<PdfDocOptions["watermark"]>): void {
    this.watermark = mark;
    this.paintWatermark();
  }

  /** Break the page when `height` would not fit under the current cursor. */
  ensure(height: number): void {
    if (this.y + height > this.bottomLimit) this.newPage();
  }

  space(amount: number): void {
    this.y += amount;
  }

  private fontFor(run: Run): PDFFont {
    if (run.sans) return run.bold ? this.helvBold : this.helv;
    if (run.bold && run.italic) return this.timesBoldItalic;
    if (run.bold) return this.timesBold;
    if (run.italic) return this.timesItalic;
    return this.times;
  }

  /**
   * Greedy word wrap across styled runs.
   *
   * Runs rather than a plain string because the original marks values inline
   * — "installation **3KWP** Solar Plant" — and a bold word must not force
   * the paragraph into separate blocks.
   */
  wrap(runs: Run[], width: number, opts: TextOptions = {}): Line[] {
    const size = opts.size ?? this.baseSize;
    const leading = (opts.leading ?? this.baseLeading) * size;
    const tokens: Token[] = [];

    for (const run of runs) {
      const font = this.fontFor(run);
      const runSize = run.size ?? size;
      const color = run.color ?? opts.color ?? COLORS.ink;
      // Split before sanitising: a newline is not a printable character, so
      // `sanitize` strips it, and splitting afterwards would never see one.
      // Explicit newlines survive as break tokens so a cell can hold two
      // lines without the caller splitting the run itself.
      const segments = run.text.split("\n").map(sanitize);
      segments.forEach((segment, index) => {
        for (const word of segment.split(/ +/)) {
          if (!word) continue;
          tokens.push({
            text: word,
            font,
            size: runSize,
            color,
            width: font.widthOfTextAtSize(word, runSize),
            underline: run.underline ?? false,
          });
        }
        if (index < segments.length - 1) {
          tokens.push({ text: "", font, size: runSize, color, width: 0, underline: false, br: true });
        }
      });
    }

    const lines: Line[] = [];
    let current: Token[] = [];
    let used = 0;

    const push = () => {
      const height = current.length
        ? Math.max(...current.map((t) => (t.size / size) * leading))
        : leading;
      lines.push({ tokens: current, width: used, spaces: Math.max(current.length - 1, 0), height });
      current = [];
      used = 0;
    };

    for (const token of tokens) {
      if (token.br) {
        push();
        continue;
      }
      const spaceWidth = current.length ? token.font.widthOfTextAtSize(" ", token.size) : 0;
      if (current.length && used + spaceWidth + token.width > width) {
        push();
        current.push(token);
        used = token.width;
        continue;
      }
      current.push(token);
      used += spaceWidth + token.width;
    }
    if (current.length || lines.length === 0) push();

    return lines;
  }

  measure(runs: Run[], width: number, opts: TextOptions = {}): number {
    return this.wrap(runs, width, opts).reduce((sum, line) => sum + line.height, 0);
  }

  /**
   * Draw already-wrapped lines at a fixed position. Used by both `paragraph`
   * and the table, which must measure every cell before it commits to a row
   * height and so cannot let drawing advance the page cursor.
   */
  drawLines(
    lines: Line[],
    x: number,
    top: number,
    width: number,
    align: Align = "left",
  ): number {
    let cursor = top;

    lines.forEach((line, index) => {
      const last = index === lines.length - 1;
      const slack = width - line.width;
      let penX = x;
      let extra = 0;

      if (align === "center") penX = x + slack / 2;
      else if (align === "right") penX = x + slack;
      else if (align === "justify" && !last && line.spaces > 0 && slack > 0) {
        extra = slack / line.spaces;
      }

      for (const [i, token] of line.tokens.entries()) {
        if (i > 0) penX += token.font.widthOfTextAtSize(" ", token.size) + extra;
        const baseline = this.baselineFor(cursor, token.size);
        this.page.drawText(token.text, {
          x: penX,
          y: baseline,
          size: token.size,
          font: token.font,
          color: token.color,
        });
        if (token.underline) {
          this.page.drawLine({
            start: { x: penX, y: baseline - 1.6 },
            end: { x: penX + token.width, y: baseline - 1.6 },
            thickness: 0.6,
            color: token.color,
          });
        }
        penX += token.width;
      }

      cursor += line.height;
    });

    return cursor - top;
  }

  /**
   * A paragraph, wrapped and page-broken.
   *
   * A paragraph taller than one page is split line by line rather than
   * pushed whole, because the long prose blocks in the middle of this
   * document would otherwise leave half-empty pages.
   */
  paragraph(runs: Run[] | string, opts: TextOptions = {}): void {
    const list = typeof runs === "string" ? [{ text: runs }] : runs;
    const indent = opts.indent ?? 0;
    const width = this.contentWidth - indent;
    const lines = this.wrap(list, width, opts);

    this.y += opts.spaceBefore ?? 0;

    // Lines are accumulated and drawn in one go per page, so the whole
    // paragraph does not have to fit — only the next line does.
    let batch: Line[] = [];
    let batchTop = this.y;
    let batchHeight = 0;

    const flush = () => {
      if (batch.length) {
        this.drawLines(batch, this.margin.left + indent, batchTop, width, opts.align ?? "left");
      }
      this.y = batchTop + batchHeight;
      batch = [];
      batchHeight = 0;
    };

    for (const line of lines) {
      if (batch.length && batchTop + batchHeight + line.height > this.bottomLimit) {
        flush();
        this.newPage();
        batchTop = this.y;
      }
      batch.push(line);
      batchHeight += line.height;
    }
    flush();

    this.y += opts.spaceAfter ?? 0;
  }

  /**
   * A blue section heading — "Project Scope:", "Material Description:".
   *
   * Kept with what follows. A heading alone at the foot of a page, with its
   * list or table overleaf, is the one layout fault a reader notices
   * immediately, so the break is taken before the heading instead.
   */
  heading(
    text: string,
    opts: { size?: number; spaceBefore?: number; spaceAfter?: number; keepWith?: number } = {},
  ): void {
    const size = opts.size ?? 12.5;
    this.y += opts.spaceBefore ?? 10;
    this.ensure(size * 1.4 + (opts.keepWith ?? this.baseSize * this.baseLeading * 2.5));
    this.paragraph([{ text, bold: true, size, color: COLORS.heading }], {
      size,
      spaceAfter: opts.spaceAfter ?? 5,
    });
  }

  /** The same, in black — "Solar Energy:", "Note:", "Excluded from Price:". */
  label(text: string, opts: { size?: number; spaceBefore?: number; spaceAfter?: number; keepWith?: number } = {}): void {
    const size = opts.size ?? 11.5;
    this.y += opts.spaceBefore ?? 0;
    this.ensure(size * 1.4 + (opts.keepWith ?? this.baseSize * this.baseLeading * 2.5));
    this.paragraph([{ text, bold: true, size }], { size, spaceAfter: opts.spaceAfter ?? 2 });
  }

  /**
   * A bulleted list. The bullet sits in its own gutter so wrapped lines
   * align under the text, not under the dot.
   */
  bullets(
    items: Array<Run[] | string>,
    opts: TextOptions & { gutter?: number; bullet?: string; itemGap?: number } = {},
  ): void {
    const size = opts.size ?? this.baseSize;
    const gutter = opts.gutter ?? 18;
    const bullet = opts.bullet ?? "•";
    const indent = opts.indent ?? 10;
    const width = this.contentWidth - indent - gutter;

    for (const item of items) {
      const runs = typeof item === "string" ? [{ text: item }] : item;
      const lines = this.wrap(runs, width, opts);
      const height = lines.reduce((sum, line) => sum + line.height, 0);
      // A bullet is kept whole: breaking one across a page would orphan the
      // dot. They are a line or three, so this never strands a page.
      if (this.y + height > this.bottomLimit) this.newPage();

      this.page.drawText(sanitize(bullet), {
        x: this.margin.left + indent,
        y: this.baselineFor(this.y, size),
        size,
        font: this.times,
        color: opts.color ?? COLORS.ink,
      });
      this.drawLines(lines, this.margin.left + indent + gutter, this.y, width, opts.align ?? "left");
      this.y += height + (opts.itemGap ?? 2);
    }

    this.y += opts.spaceAfter ?? 0;
  }

  get contentHeight(): number {
    return A4.height - this.margin.top - this.margin.bottom;
  }

  async save(): Promise<Buffer> {
    return Buffer.from(await this.pdf.save());
  }
}

// ── Tables ──────────────────────────────────────────────────────────────

export type Cell =
  | { runs: Run[] | string; align?: Align; bold?: boolean }
  /** A ticked or empty box, drawn as vectors: WinAnsi has no box glyph. */
  | { check: boolean };

export interface TableOptions {
  /** Column widths in points. Must sum to the content width. */
  cols: number[];
  rows: Cell[][];
  size?: number;
  padX?: number;
  padY?: number;
  minRowHeight?: number;
  borderWidth?: number;
  /**
   * How many leading rows must stay together. The header row alone at the
   * foot of a page is useless, and rows carried to the next page have no
   * header above them — this table never repeats one, because the original
   * does not.
   */
  keepTogether?: number;
}

function isCheck(cell: Cell): cell is { check: boolean } {
  return "check" in cell;
}

/**
 * A bordered table that breaks across pages.
 *
 * Rows are measured and drawn one at a time; a row that will not fit starts
 * the next page. The header row is deliberately NOT repeated after a break —
 * the original quotation does not repeat it, and a document that goes to a
 * customer has to match the one they were shown last time.
 */
export function drawTable(doc: PdfDoc, options: TableOptions): void {
  const {
    cols,
    rows,
    size = 10.5,
    padX = 5,
    padY = 4,
    minRowHeight = 0,
    borderWidth = 0.75,
    keepTogether = 2,
  } = options;

  const layout = (row: Cell[]) =>
    row.map((cell, index) => {
      if (isCheck(cell)) return { cell, lines: [] as Line[], height: size * 1.32 };
      const runs = typeof cell.runs === "string" ? [{ text: cell.runs }] : cell.runs;
      const styled = cell.bold ? runs.map((r) => ({ ...r, bold: true })) : runs;
      const lines = doc.wrap(styled, cols[index]! - padX * 2, { size });
      return { cell, lines, height: lines.reduce((sum, line) => sum + line.height, 0) };
    });

  const heightOf = (row: Cell[]) =>
    Math.max(minRowHeight, ...layout(row).map((c) => c.height + padY * 2));

  // Take the break before the table rather than between its first rows.
  const opener = rows
    .slice(0, Math.max(keepTogether, 1))
    .reduce((sum, row) => sum + heightOf(row), 0);
  if (rows.length && doc.y + opener > doc.bottomLimit && opener <= doc.contentHeight) {
    doc.newPage();
  }

  for (const row of rows) {
    const laid = layout(row);
    const height = Math.max(minRowHeight, ...laid.map((c) => c.height + padY * 2));

    if (doc.y + height > doc.bottomLimit) doc.newPage();

    let x = doc.margin.left;
    for (const [index, item] of laid.entries()) {
      const width = cols[index]!;

      doc.page.drawRectangle({
        x,
        y: A4.height - doc.y - height,
        width,
        height,
        borderWidth,
        borderColor: COLORS.line,
      });

      if (isCheck(item.cell)) {
        drawCheckbox(doc, x + width / 2 - 5, doc.y + height / 2 - 5, item.cell.check);
      } else {
        doc.drawLines(
          item.lines,
          x + padX,
          doc.y + padY,
          width - padX * 2,
          item.cell.align ?? "left",
        );
      }

      x += width;
    }

    doc.y += height;
  }
}

/** A 10pt box, with a tick drawn inside it when set. */
function drawCheckbox(doc: PdfDoc, left: number, top: number, ticked: boolean): void {
  const sizePt = 10;
  const bottom = A4.height - top - sizePt;

  doc.page.drawRectangle({
    x: left,
    y: bottom,
    width: sizePt,
    height: sizePt,
    borderWidth: 0.9,
    borderColor: COLORS.line,
  });

  if (!ticked) return;
  doc.page.drawLine({
    start: { x: left + 1.9, y: bottom + 5.2 },
    end: { x: left + 4.0, y: bottom + 2.3 },
    thickness: 1.1,
    color: COLORS.line,
  });
  doc.page.drawLine({
    start: { x: left + 4.0, y: bottom + 2.3 },
    end: { x: left + 8.4, y: bottom + 8.1 },
    thickness: 1.1,
    color: COLORS.line,
  });
}
