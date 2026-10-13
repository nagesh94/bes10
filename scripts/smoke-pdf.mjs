/**
 * A document can be a photo or a PDF. This checks the PDF path:
 * page count, the under-cap shortcut, and the over-cap honesty.
 *
 *   npx tsx scripts/smoke-pdf.mjs
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildVariants } from "../src/lib/storage/variants.ts";
import { PORTAL_MAX_KB } from "../src/lib/storage/client.ts";

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  process.exitCode = 1;
};
const kb = (n) => Math.round(n / 1024);

try {
  // A small three-page PDF, like a khasra extract from MP Bhulekh.
  const small = await PDFDocument.create();
  const font = await small.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = small.addPage([595, 842]); // A4
    page.drawText(`Khasra extract — page ${i}`, { x: 60, y: 760, size: 18, font });
  }
  const smallBytes = Buffer.from(await small.save());

  console.log(`\n  small PDF: ${kb(smallBytes.byteLength)} KB, 3 pages\n`);

  const v1 = await buildVariants(smallBytes, "application/pdf");
  v1.pageCount === 3 ? pass("page count read from the PDF") : fail(`page count was ${v1.pageCount}`);
  v1.portalSameAsOriginal
    ? pass("already under the cap — portal reuses the original object, not a second copy")
    : fail("stored a duplicate when it did not need to");
  v1.portal === v1.original ? pass("portal variant is the same buffer") : fail("portal differs");
  v1.thumb === null ? pass("no thumbnail for a PDF, as expected") : fail("made a thumbnail");

  // A fat PDF with a big embedded image, like a 600-dpi scan.
  const fat = await PDFDocument.create();
  const noise = Buffer.alloc(900_000);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
  // A JPEG the library will embed as-is.
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp({
    create: { width: 2400, height: 3400, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 80 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  const img = await fat.embedJpg(jpeg);
  const p = fat.addPage([595, 842]);
  p.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  const fatBytes = Buffer.from(await fat.save());

  console.log(`\n  scanned PDF: ${kb(fatBytes.byteLength)} KB, 1 page\n`);
  fatBytes.byteLength > PORTAL_MAX_KB * 1024
    ? pass(`over the ${PORTAL_MAX_KB} KB cap, as a real scan would be`)
    : fail("test PDF is not actually over the cap");

  const v2 = await buildVariants(fatBytes, "application/pdf");
  v2.pageCount === 1 ? pass("page count read") : fail(`page count was ${v2.pageCount}`);
  v2.portalOverCap
    ? pass("flagged as over the cap rather than silently uploaded")
    : fail("did not flag an oversized PDF");
  v2.portal && v2.portal.bytes <= fatBytes.byteLength
    ? pass(`re-save produced ${kb(v2.portal.bytes)} KB from ${kb(fatBytes.byteLength)} KB`)
    : fail("re-save made it bigger");

  // A photo still behaves as before.
  const photo = await sharp({
    create: { width: 3000, height: 2000, channels: 3, noise: { type: "gaussian", mean: 140, sigma: 70 } },
  })
    .jpeg({ quality: 94 })
    .toBuffer();
  const v3 = await buildVariants(photo, "image/jpeg");
  v3.portal && v3.portal.bytes <= PORTAL_MAX_KB * 1024 && v3.thumb
    ? pass(`a photo still gets a ${kb(v3.portal.bytes)} KB portal copy and a thumbnail`)
    : fail("image path regressed");

  console.log("");
} catch (err) {
  console.error("\nPDF smoke test failed:\n", err);
  process.exitCode = 1;
}
