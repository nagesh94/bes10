/** Several site-survey photos at once, geotagged and stamped. */
import sharp from "sharp";
import postgres from "postgres";
import { ensureBuckets, presignUpload, getTempObject, putDocument, deleteTempObject, presignDownload } from "../src/lib/storage/operations.ts";
import { buildVariants, stampGeo } from "../src/lib/storage/variants.ts";
import { documentKey } from "../src/lib/storage/client.ts";

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); process.exitCode = 1; };
const sql = postgres(process.env.DATABASE_URL);
const projectId = process.argv[2];

await ensureBuckets();
const geo = { latitude: 21.8840185, longitude: 77.9016424, capturedAt: new Date() };
const ids = [];

for (let i = 1; i <= 3; i++) {
  const photo = await sharp({ create: { width: 3000, height: 2250, channels: 3,
    noise: { type: "gaussian", mean: 120 + i * 20, sigma: 60 } } }).jpeg({ quality: 90 }).toBuffer();

  const tempKey = `incoming/${projectId}/${crypto.randomUUID()}-site-${i}.jpg`;
  const url = await presignUpload(tempKey, "image/jpeg");
  const put = await fetch(url, { method: "PUT", body: photo, headers: { "Content-Type": "image/jpeg" } });
  if (!put.ok) fail(`photo ${i} PUT ${put.status}`);

  const src = await getTempObject(tempKey);
  const stamped = await stampGeo(src.body, geo);
  const v = await buildVariants(stamped, "image/jpeg");

  const kO = documentKey(projectId, "SITE_SURVEY", "original", `site-${i}.jpg`);
  const kT = documentKey(projectId, "SITE_SURVEY", "thumb", `site-${i}.jpg`);
  await putDocument(kO, v.original.body, "image/jpeg");
  await putDocument(kT, v.thumb.body, "image/jpeg");
  await deleteTempObject(tempKey);

  const id = `pho_${crypto.randomUUID().replace(/-/g,"").slice(0,20)}`;
  await sql`insert into photos (id, project_id, photo_type, s3_key_original, s3_key_thumb, latitude, longitude, captured_at)
            values (${id}, ${projectId}, 'SITE_SURVEY', ${kO}, ${kT}, ${geo.latitude}, ${geo.longitude}, now())`;
  ids.push(id);
}
pass(`${ids.length} site photos uploaded in one batch`);

const rows = await sql`select id, latitude, longitude, s3_key_thumb from photos where project_id = ${projectId} and photo_type = 'SITE_SURVEY'`;
rows.length >= 3 ? pass(`${rows.length} rows in the photos table`) : fail(`only ${rows.length} rows`);
rows.every(r => r.latitude && r.longitude) ? pass("every photo carries coordinates") : fail("a photo has no coordinates");

const thumb = await fetch(await presignDownload(rows[0].s3_key_thumb, 60));
thumb.ok ? pass("thumbnail loads through a presigned URL") : fail(`thumb ${thumb.status}`);

const meta = await sharp(Buffer.from(await (await fetch(await presignDownload(rows[0].s3_key_thumb, 60))).arrayBuffer())).metadata();
meta.width <= 320 ? pass(`thumb is ${meta.width}×${meta.height}`) : fail(`thumb too big: ${meta.width}`);

await sql.end();
console.log("");
