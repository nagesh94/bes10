/**
 * Phase 1 smoke test: create a lead, convert it, and check what landed in the
 * database. Exercises the real schema and the real project-code generator.
 *
 *   node scripts/with-swc-cache.mjs node scripts/smoke-phase1.mjs
 */
import postgres from "postgres";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://bhim:bhim_local_dev@localhost:5433/bhim_crm",
);

const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

const id = (p) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

try {
  const contactId = id("con");
  const projectId = id("prj");
  const year = new Date().getFullYear();

  const [{ n }] = await sql`
    select count(*)::int as n from projects where code like ${`BHIM-${year}-%`}
  `;
  const code = `BHIM-${year}-${String(n + 1).padStart(4, "0")}`;

  await sql.begin(async (tx) => {
    await tx`
      insert into contacts (id, first_name, last_name, phone, address, pin_code)
      values (${contactId}, 'Krishni', 'Nagde', '9406535153',
              'Sharda Nagar, Gauthana, Ranipur Road, Betul', '460001')
    `;
    await tx`
      insert into projects (id, code, contact_id, lifecycle_stage, pipeline_stage,
                            lead_status, lead_source, interested_plant_kw)
      values (${projectId}, ${code}, ${contactId}, 'LEAD', 1, 'NEW', 'REFERRAL', '5 kW')
    `;
    for (let s = 1; s <= 9; s++) {
      await tx`
        insert into project_stage_progress (project_id, stage_no, status)
        values (${projectId}, ${s}, ${s === 1 ? "in_progress" : "not_started"})
      `;
    }
  });
  pass(`lead created as ${code}`);

  const [{ stages }] = await sql`
    select count(*)::int as stages from project_stage_progress where project_id = ${projectId}
  `;
  stages === 9 ? pass("nine stage rows created") : fail(`expected 9 stage rows, got ${stages}`);

  // Convert — the same row changes status; nothing is copied.
  const portalId = "NP-MPMK26-14534479";
  await sql.begin(async (tx) => {
    await tx`
      insert into application_details (project_id, national_portal_id, application_date, is_dcr, wants_subsidy)
      values (${projectId}, ${portalId}, current_date, true, true)
      on conflict (project_id) do update set national_portal_id = excluded.national_portal_id
    `;
    await tx`update projects set lifecycle_stage = 'PROSPECT' where id = ${projectId}`;
    await tx`
      insert into stage_history (project_id, from_stage, to_stage, note)
      values (${projectId}, 1, 1, ${`Converted to prospect · ${portalId}`})
    `;
  });

  const [after] = await sql`
    select p.id, p.code, p.lifecycle_stage, a.national_portal_id
    from projects p
    left join application_details a on a.project_id = p.id
    where p.id = ${projectId}
  `;

  after.lifecycle_stage === "PROSPECT"
    ? pass("lifecycle is now PROSPECT")
    : fail(`lifecycle is ${after.lifecycle_stage}`);
  after.code === code ? pass("project code unchanged by conversion") : fail("code changed");
  after.national_portal_id === portalId
    ? pass("portal ID stored")
    : fail(`portal ID is ${after.national_portal_id}`);
  after.id === projectId ? pass("same row — nothing copied") : fail("row identity changed");

  const [{ h }] = await sql`
    select count(*)::int as h from stage_history where project_id = ${projectId}
  `;
  h === 1 ? pass("conversion recorded in stage history") : fail(`history rows: ${h}`);

  console.log(`\n  ${code} is ready for stage 1.\n`);
} catch (err) {
  console.error("\nSmoke test failed:\n", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
