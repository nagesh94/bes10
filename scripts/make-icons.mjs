/**
 * Renders the app icons from assets/icon-source.svg.
 *
 *   node scripts/make-icons.mjs
 *
 * Two shapes are produced from the one drawing. The plain icons fill the
 * square; the maskable one is inset to 72% and sits on the chrome colour,
 * because Android crops a maskable icon to whatever shape the launcher
 * uses and anything in the outer 20% can be cut away.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "assets", "icon-source.svg");
const out = join(root, "public", "icons");

const CHROME = "#081E36";

const plain = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "favicon-32.png", size: 32 },
  { file: "favicon-16.png", size: 16 },
];

await mkdir(out, { recursive: true });
const svg = await readFile(src);

for (const { file, size } of plain) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: CHROME })
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
  console.log(`${file} ${size}×${size}`);
}

// Maskable: the drawing at 72%, centred on the chrome colour.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.72);
  const pad = Math.round((size - inner) / 2);
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: CHROME,
    },
  })
    .composite([{ input: art, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, `maskable-${size}.png`));
  console.log(`maskable-${size}.png ${size}×${size}`);
}

// A monochrome mark for the browser tab, which renders SVG at any size.
await writeFile(join(out, "icon.svg"), svg);
console.log("icon.svg");
