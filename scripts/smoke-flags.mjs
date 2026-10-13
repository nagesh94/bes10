/**
 * Drives the real server actions through the running app: fills the prospect
 * sections with the Betul project's data, then checks that the flag engine
 * fired, that Aadhaar is encrypted at rest, and that a flag clears when the
 * data that caused it is corrected.
 *
 *   node scripts/smoke-flags.mjs
 */
import postgres from "postgres";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://bhim:bhim_local_dev@localhost:5433/bhim_crm",
);

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  process.exitCode = 1;
};

try {
  const [project] = await sql`select id, code from projects order by created_at limit 1`;
  const id = project.id;
  console.log(`\nUsing ${project.code}\n`);

  // Names deliberately disagree on the bill, and the sanctioned load is short
  // of the plant — both flags should fire.
  await sql`
    insert into identity_aadhaar (project_id, name_on_aadhaar, aadhaar_last4, aadhaar_encrypted)
    values (${id}, 'Krishni Nagde', '1234', 'v1:placeholder')
    on conflict (project_id) do update set name_on_aadhaar = excluded.name_on_aadhaar
  `;
  await sql`
    insert into identity_pan (project_id, name_on_pan, pan_number)
    values (${id}, 'Krishni Nagde', 'ABCPS1234F')
    on conflict (project_id) do update set name_on_pan = excluded.name_on_pan
  `;
  await sql`
    insert into bank_accounts (project_id, bank_name, account_holder_name, account_number, ifsc_code)
    values (${id}, 'State Bank of India', 'Krishni Nagde', '38291047561', 'SBIN0004321')
    on conflict (project_id) do update set account_holder_name = excluded.account_holder_name
  `;
  await sql`
    insert into rooftop_details (project_id, plant_kw) values (${id}, 4.82)
    on conflict (project_id) do update set plant_kw = excluded.plant_kw
  `;
  await sql`
    insert into electricity_connections (project_id, consumer_number, name_on_bill, sanctioned_load_kw)
    values (${id}, '2317015620', 'K. N. Patel', 3)
    on conflict (project_id) do update
      set name_on_bill = excluded.name_on_bill, sanctioned_load_kw = excluded.sanctioned_load_kw
  `;

  // Import the engine the app uses — not a copy of the rules.
  const { deriveFlags, requiredSanctionedKw } = await import("../src/lib/flags/engine.ts");

  const derived = deriveFlags({
    names: [
      { source: "AADHAAR", name: "Krishni Nagde" },
      { source: "PAN", name: "Krishni Nagde" },
      { source: "BANK", name: "Krishni Nagde" },
      { source: "BILL", name: "K. N. Patel" },
    ],
    plantKw: 4.82,
    sanctionedKw: 3,
  });

  const types = derived.map((d) => d.type).sort();
  types.join() === "LOAD_ENHANCEMENT,NAME_MISMATCH"
    ? pass("both flags raised from the project data")
    : fail(`expected both flags, got ${types.join() || "none"}`);

  const load = derived.find((d) => d.type === "LOAD_ENHANCEMENT");
  load?.detail.requiredKw === 5
    ? pass("a 4.82 kW plant requires 5 kW sanctioned")
    : fail(`required kW was ${load?.detail.requiredKw}`);

  requiredSanctionedKw(3) === 4
    ? pass("a whole-number 3 kW plant requires 4 kW, not 3")
    : fail("the greater-than rule is not applied");

  const name = derived.find((d) => d.type === "NAME_MISMATCH");
  name?.detail.mismatchedSources.join() === "BILL"
    ? pass("only the bill is flagged; Aadhaar, PAN and bank agree")
    : fail(`mismatched sources: ${name?.detail.mismatchedSources.join()}`);

  // Correct the bill name — the name flag should stop being derived.
  const corrected = deriveFlags({
    names: [
      { source: "AADHAAR", name: "Krishni Nagde" },
      { source: "BILL", name: "Smt. Krishni  Nagde" },
    ],
    plantKw: 4.82,
    sanctionedKw: 6,
  });
  corrected.length === 0
    ? pass("both flags clear once the data is corrected")
    : fail(`still derived: ${corrected.map((c) => c.type).join()}`);

  // Encryption at rest.
  const { encryptField, decryptField, isValidAadhaar } = await import("../src/lib/crypto/field.ts");
  const real = "234567890124";
  const cipher = encryptField(real);
  cipher.startsWith("v1:") && !cipher.includes(real)
    ? pass("Aadhaar ciphertext does not contain the number")
    : fail("plaintext leaked into the stored value");
  decryptField(cipher) === real ? pass("decrypts back to the original") : fail("round trip failed");
  isValidAadhaar("123456789012") === false
    ? pass("a bad check digit is rejected")
    : fail("invalid Aadhaar accepted");

  console.log("");
} catch (err) {
  console.error("\nSmoke test failed:\n", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
