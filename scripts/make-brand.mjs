/**
 * Prepares the wordmark for the app chrome.
 *
 *   node scripts/make-brand.mjs
 *
 * The supplied file is a 500×500 canvas with a 471×144 wordmark floating in
 * the middle of it, so anything that sets a height renders a mostly-empty
 * square. This trims it to its own bounds and writes two versions: the
 * original colours for light surfaces, and one with the navy lettering
 * lifted to near-white for the dark app bar. The orange bolt and the green
 * sub-line are left alone — they are the brand and they read on both.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "brand", "bhim-wordmark.png");
const out = (name) => join(root, "public", "brand", name);

const trimmed = await sharp(src).trim({ threshold: 10 }).png().toBuffer();
await sharp(trimmed).toFile(out("wordmark.png"));

const { data, info } = await sharp(trimmed)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Navy is the only dark, blue-dominant colour in the mark; the bolt is
// orange and the sub-line green, both far from this test.
for (let i = 0; i < data.length; i += info.channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const dark = r < 120 && g < 120;
  const bluish = b > r + 20;
  if (dark && bluish) {
    data[i] = 0xf3;
    data[i + 1] = 0xf7;
    data[i + 2] = 0xfd;
  }
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
  .png()
  .toFile(out("wordmark-on-dark.png"));

console.log(`wordmark.png and wordmark-on-dark.png — ${info.width}×${info.height}`);
