import { PDFDocument } from "pdf-lib";
import { A4 } from "@/lib/pdf/layout";

/**
 * Concatenates whole PDFs, in order, into one.
 *
 * Used for the submission pack: every input is already a single-document
 * PDF (a converted .docx or the meter receipt), so this only ever appends
 * pages — it never needs to know what is inside them.
 */
export async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return Buffer.from(await merged.save());
}

/**
 * Wraps a photo of a meter receipt in a single A4 PDF page, scaled to fit.
 *
 * The receipt downloaded from the DISCOM portal is usually already a PDF,
 * but a phone photo of a printed slip is just as common, and the merge needs
 * one page either way.
 */
export async function imageToPdfPage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const image = mimeType.includes("png")
    ? await doc.embedPng(buffer)
    : await doc.embedJpg(buffer);

  const page = doc.addPage([A4.width, A4.height]);
  const margin = 36;
  const maxWidth = A4.width - margin * 2;
  const maxHeight = A4.height - margin * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawImage(image, {
    x: (A4.width - width) / 2,
    y: (A4.height - height) / 2,
    width,
    height,
  });

  return Buffer.from(await doc.save());
}
