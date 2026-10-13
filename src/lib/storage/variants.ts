import sharp from "sharp";
import { PORTAL_MAX_KB } from "./client";

/**
 * Three variants per upload.
 *
 *   original — never touched. This is what prints in the bank pack, so it
 *              keeps its full resolution even when that means 8 MB.
 *   portal   — squeezed under the government portal's size cap.
 *   thumb    — small, for listings.
 *
 * The squeezing happens here, on the server, rather than by someone resizing
 * a photo on their phone at the DISCOM counter. That is the single most
 * useful thing this module does.
 */

export interface Variant {
  body: Buffer;
  contentType: string;
  bytes: number;
}

export interface VariantSet {
  original: Variant;
  portal: Variant | null;
  thumb: Variant | null;
  width?: number;
  height?: number;
  pageCount?: number;
  /**
   * The portal copy is byte-identical to the original, so the caller should
   * point both keys at one object instead of storing it twice.
   */
  portalSameAsOriginal?: boolean;
  /** Set when nothing could get the file under the cap. */
  portalOverCap?: boolean;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function isImage(contentType: string): boolean {
  return IMAGE_TYPES.includes(contentType.toLowerCase());
}

export function isPdf(contentType: string): boolean {
  return contentType.toLowerCase() === "application/pdf";
}

/**
 * PDFs.
 *
 * Every document slot takes either a photo or a PDF, because half of what
 * arrives is a phone photo of a card and the other half is a scan or a
 * portal download.
 *
 * A PDF cannot be resized the way an image can — shrinking one properly
 * means rasterising every page, which needs a PDF renderer we do not have
 * here. So:
 *
 *   already under the cap  → the original IS the portal copy; store one
 *                            object and point both keys at it
 *   over the cap           → re-save through pdf-lib, which strips some
 *                            bloat, and if that is still too big, say so
 *                            plainly rather than silently uploading a file
 *                            the portal will reject
 *
 * Page count is read here because the bank loan pack needs it to lay out
 * the cover checklist.
 */
async function buildPdfVariants(input: Buffer, original: Variant): Promise<VariantSet> {
  const cap = PORTAL_MAX_KB * 1024;

  let pageCount: number | undefined;
  let rewritten: Buffer | null = null;

  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(input, { ignoreEncryption: true });
    pageCount = doc.getPageCount();

    if (input.byteLength > cap) {
      // Re-saving drops unused objects and compresses the object streams.
      // It is not rasterisation, but it reliably trims scanner output.
      const bytes = await doc.save({ useObjectStreams: true });
      rewritten = Buffer.from(bytes);
    }
  } catch {
    // An encrypted or malformed PDF still uploads; it just gets no page
    // count and no portal copy.
  }

  if (input.byteLength <= cap) {
    return {
      original,
      portal: original,
      thumb: null,
      portalSameAsOriginal: true,
      ...(pageCount === undefined ? {} : { pageCount }),
    };
  }

  if (rewritten && rewritten.byteLength <= cap) {
    return {
      original,
      portal: { body: rewritten, contentType: "application/pdf", bytes: rewritten.byteLength },
      thumb: null,
      ...(pageCount === undefined ? {} : { pageCount }),
    };
  }

  const best = rewritten && rewritten.byteLength < input.byteLength ? rewritten : input;
  return {
    original,
    portal: { body: best, contentType: "application/pdf", bytes: best.byteLength },
    thumb: null,
    portalOverCap: true,
    ...(pageCount === undefined ? {} : { pageCount }),
  };
}

/**
 * Walks quality down until the file fits, then gives up gracefully rather
 * than producing something unreadable. Each step also caps the long edge,
 * because a 4000px photo at quality 40 looks worse than 1600px at quality 72.
 *
 * The ladder starts generous and steps down, so a cap with room to spare
 * spends it on detail instead of leaving it unused — the first rung that
 * fits wins, and the original is kept untouched regardless. The bottom rungs
 * only ever run when the cap is genuinely tight.
 */
async function fitUnderCap(input: Buffer, maxBytes: number): Promise<Variant> {
  const attempts: Array<{ edge: number; quality: number }> = [
    { edge: 3200, quality: 92 },
    { edge: 2600, quality: 88 },
    { edge: 2000, quality: 82 },
    { edge: 1600, quality: 72 },
    { edge: 1400, quality: 62 },
    { edge: 1200, quality: 52 },
    { edge: 1000, quality: 44 },
    { edge: 900, quality: 36 },
  ];

  let last: Buffer | null = null;

  for (const { edge, quality } of attempts) {
    const out = await sharp(input)
      .rotate() // honour the EXIF orientation flag before stripping metadata
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    last = out;
    if (out.byteLength <= maxBytes) {
      return { body: out, contentType: "image/jpeg", bytes: out.byteLength };
    }
  }

  // Everything tried; hand back the smallest we managed so the upload still
  // succeeds, and let the caller warn that it is over the cap.
  const body = last ?? input;
  return { body, contentType: "image/jpeg", bytes: body.byteLength };
}

export async function buildVariants(
  input: Buffer,
  contentType: string,
): Promise<VariantSet> {
  const original: Variant = {
    body: input,
    contentType,
    bytes: input.byteLength,
  };

  if (isPdf(contentType)) return buildPdfVariants(input, original);

  if (!isImage(contentType)) {
    return { original, portal: null, thumb: null };
  }

  const meta = await sharp(input).metadata();
  const portal = await fitUnderCap(input, PORTAL_MAX_KB * 1024);

  const thumbBuf = await sharp(input)
    .rotate()
    .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  return {
    original,
    portal,
    thumb: { body: thumbBuf, contentType: "image/jpeg", bytes: thumbBuf.byteLength },
    ...(meta.width === undefined ? {} : { width: meta.width }),
    ...(meta.height === undefined ? {} : { height: meta.height }),
  };
}

/**
 * Burns the coordinates and time into the corner of a field photo.
 *
 * The DISCOM wants geotagged evidence, and a caption the app draws is more
 * reliable than trusting a phone's camera app — especially on iOS Safari,
 * which strips EXIF GPS from web uploads entirely.
 */
export async function stampGeo(
  input: Buffer,
  opts: { latitude: number; longitude: number; capturedAt: Date },
): Promise<Buffer> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 1600;
  const height = meta.height ?? 1200;

  const pad = Math.round(width * 0.02);
  const fontSize = Math.max(14, Math.round(width * 0.022));
  const barHeight = Math.round(fontSize * 3.1);

  const lat = `${Math.abs(opts.latitude).toFixed(6)}°${opts.latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(opts.longitude).toFixed(6)}°${opts.longitude >= 0 ? "E" : "W"}`;
  const when = opts.capturedAt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const escape = (s: string) => s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${height - barHeight}" width="${width}" height="${barHeight}" fill="rgba(2,13,30,0.82)"/>
    <text x="${pad}" y="${height - barHeight + fontSize * 1.25}" font-family="monospace" font-size="${fontSize}" fill="#DCE7F5">${escape(`${lat}  ${lon}`)}</text>
    <text x="${pad}" y="${height - barHeight + fontSize * 2.6}" font-family="monospace" font-size="${fontSize}" fill="#9DB7D8">${escape(when)}</text>
  </svg>`;

  return image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toBuffer();
}
