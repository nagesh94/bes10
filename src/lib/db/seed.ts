/**
 * Seeds the database with the admin account and every master table.
 *
 *   npm run db:seed
 *
 * Two properties matter here, because this also runs against production:
 *
 * 1. It is declarative, not one-shot. Each master table below lists the rows
 *    that should exist; the script inserts only the ones that are missing,
 *    matched on the column a human would call the name. So adding a panel
 *    model to this file and re-running is the supported way to ship new
 *    master data — the old behaviour of skipping a table entirely once it held
 *    any row at all meant the script was useful exactly once per environment.
 *
 * 2. It never overwrites. Admin edits made in the UI are the newer truth; this
 *    file is a floor, not a source of record. Nothing is updated or deleted,
 *    so a re-run can add rows but can never undo an afternoon's corrections.
 *
 * The Betul values are real — they come out of the Krishni Nagde project
 * (NP-MPMK26-14534479), so the first generated document can be checked
 * against a known-good one rather than against invented values.
 */

import { and, eq } from "drizzle-orm";
import { db, sql } from "./index";
import {
  banks,
  cableMakes,
  companyBranches,
  discomCircles,
  discomCompanies,
  discomDivisions,
  discomRegions,
  discomZones,
  inverterModels,
  panelCompanies,
  panelModels,
  panelTypes,
  plantSizes,
  structureCompanies,
  user,
} from "./schema";
import { auth } from "../auth";

// ── Admin account ─────────────────────────────────────────────────────────

/**
 * Overridable, so a real deployment is not forced to use the password that is
 * written down in a file in the repository. The defaults are the ones asked
 * for, and the script says so loudly at the end when it runs in production.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "nagesh@admin.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin@pass";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Nagesh Solanki";
const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? "7798177838";

// ── Master data ───────────────────────────────────────────────────────────

/** Tables whose only meaningful column is a name. */
const NAME_MASTERS = [
  {
    label: "panel companies",
    table: panelCompanies,
    names: [
      "Waaree Energies Limited",
      "Vikram Solar",
      "Adani Solar",
      "Tata Power Solar",
      "Jinko Solar",
      "Goldi Solar",
      "Premier Energies",
      "RenewSys",
      "Saatvik Green Energy",
      "Navitas Solar",
      "Rayzon Solar",
      "Emmvee Photovoltaic",
    ],
  },
  {
    label: "panel types",
    table: panelTypes,
    // The module technologies actually sold in the residential rooftop market
    // today — not an exhaustive list, just enough that staff rarely need to
    // type one in by hand.
    names: [
      "Mono PERC",
      "Polycrystalline",
      "Bifacial Mono PERC",
      "TOPCon",
      "Bifacial TOPCon",
      "HJT (Heterojunction)",
      "N-Type Mono",
      "Thin Film (CdTe)",
    ],
  },
  {
    label: "structure companies",
    table: structureCompanies,
    names: [
      "Shakti Fabricators",
      "Local fabrication",
      "Tata Structura",
      "Jindal Hollow Sections",
      "APL Apollo",
      "Galvanised MS (generic)",
    ],
  },
  {
    label: "cable makes",
    table: cableMakes,
    names: [
      "Polycab",
      "Havells",
      "KEI Industries",
      "Finolex Cables",
      "RR Kabel",
      "Anchor Electricals",
      "V-Guard",
      "Siechem",
      "Apar Industries",
    ],
  },
  {
    label: "banks",
    table: banks,
    /**
     * The lenders that actually appear on PM Surya Ghar files in this district,
     * plus the private banks customers bring their own accounts from. The
     * subsidy is credited to the customer's account, so this list is read far
     * more often than it is added to.
     */
    names: [
      "State Bank of India",
      "Punjab National Bank",
      "Bank of Baroda",
      "Union Bank of India",
      "Central Bank of India",
      "Canara Bank",
      "Bank of India",
      "Indian Overseas Bank",
      "Indian Bank",
      "UCO Bank",
      "Bank of Maharashtra",
      "Punjab & Sind Bank",
      "HDFC Bank",
      "ICICI Bank",
      "Axis Bank",
      "Kotak Mahindra Bank",
      "IDBI Bank",
      "Madhya Pradesh Gramin Bank",
      "Madhyanchal Gramin Bank",
    ],
  },
] as const;

/** Panel models, grouped under the company that makes them. */
const PANEL_MODELS: Record<string, { modelNo: string; wattPeak: number; isDcr: boolean }[]> = {
  "Waaree Energies Limited": [
    // The model actually installed at Betul.
    { modelNo: "BiN-08-535", wattPeak: 535, isDcr: true },
    { modelNo: "WSMD-545", wattPeak: 545, isDcr: true },
    { modelNo: "WSMD-550", wattPeak: 550, isDcr: true },
    { modelNo: "WSMD-585", wattPeak: 585, isDcr: true },
  ],
  "Vikram Solar": [
    { modelNo: "VSMDG-540", wattPeak: 540, isDcr: true },
    { modelNo: "VSMDG-575", wattPeak: 575, isDcr: true },
  ],
  "Adani Solar": [
    { modelNo: "AS-7M144", wattPeak: 550, isDcr: true },
    { modelNo: "AS-8M144", wattPeak: 580, isDcr: true },
  ],
  "Tata Power Solar": [
    { modelNo: "TP6L60M", wattPeak: 450, isDcr: true },
    { modelNo: "TP7M132", wattPeak: 540, isDcr: true },
  ],
  "Jinko Solar": [{ modelNo: "JKM-575N", wattPeak: 575, isDcr: false }],
  "Goldi Solar": [{ modelNo: "GS-PRN-540", wattPeak: 540, isDcr: true }],
  "Premier Energies": [{ modelNo: "PEPPL-550", wattPeak: 550, isDcr: true }],
  "Saatvik Green Energy": [{ modelNo: "SGE-545", wattPeak: 545, isDcr: true }],
};

const INVERTERS = [
  // The inverter actually installed at Betul.
  { manufacturer: "Polycab", brandName: "Polycab", modelNo: "PSIS-5K0", capacityKw: "5.00" },
  { manufacturer: "Polycab", brandName: "Polycab", modelNo: "PSIS-3K0", capacityKw: "3.00" },
  { manufacturer: "Deye", brandName: "Deye", modelNo: "SUN-3K-SG04LP1", capacityKw: "3.00" },
  { manufacturer: "Deye", brandName: "Deye", modelNo: "SUN-5K-SG04LP1", capacityKw: "5.00" },
  { manufacturer: "Growatt", brandName: "Growatt", modelNo: "MIN 3000TL-X", capacityKw: "3.00" },
  { manufacturer: "Growatt", brandName: "Growatt", modelNo: "MIN 5000TL-X", capacityKw: "5.00" },
  { manufacturer: "Luminous", brandName: "Luminous", modelNo: "NXG+ 5kW", capacityKw: "5.00" },
  { manufacturer: "Microtek", brandName: "Microtek", modelNo: "Gridsol 3kW", capacityKw: "3.00" },
  { manufacturer: "Sungrow", brandName: "Sungrow", modelNo: "SG5.0RS", capacityKw: "5.00" },
  { manufacturer: "Havells", brandName: "Havells", modelNo: "Enviro 5kW", capacityKw: "5.00" },
  { manufacturer: "Waaree", brandName: "Waaree", modelNo: "WOIS-5K", capacityKw: "5.00" },
  { manufacturer: "Solax Power", brandName: "Solax", modelNo: "X1-Boost-5.0", capacityKw: "5.00" },
];

/** The sanctioned-load sizes a residential quotation is actually raised for. */
const PLANT_SIZES = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10];

/**
 * DISCOM hierarchy, as the portals use it:
 *   company → region → circle → division → zone/DC
 *
 * Every generated document reads the project's own row, so a Bhopal job prints
 * Bhopal addressing with no template change. The name-change and
 * load-enhancement deep links live here too, so another zone can be added
 * without touching code.
 */
const DISCOMS = [
  {
    code: "MPMKVVCL",
    name: "Madhya Pradesh Madhya Kshetra Vidyut Vitaran Co. Ltd",
    // The work completion report asks you to strike through two of
    // Madhya / Paschim / Poorv; zoneWord picks the right one.
    zoneWord: "Madhya",
    // Saral Sanyojan handles both name change and load enhancement from the
    // same "other services" page — the two flags deep-link to the same URL.
    nameChangeUrl: "https://saralsanyojan.mpcz.in:8888/apply/other/services",
    loadEnhancementUrl: "https://saralsanyojan.mpcz.in:8888/apply/other/services",
    // The net meter fee is paid through the MPCZ rooftop vendor login, not
    // Saral Sanyojan — a different portal from the one the two flags use.
    meterPortalUrl: "https://rooftop.mpcz.in/uwp_rooftop3/vendorLogin",
    // MP Bhulekh — where the khasra land record is downloaded from.
    landRecordsUrl: "https://webgis2.mpbhulekh.gov.in/#/home/bhu-abhilekh",
    regions: [
      {
        name: "Bhopal",
        circles: [
          {
            name: "Betul Circle",
            divisions: [
              {
                name: "Betul South",
                executiveEngineerLine: "Betul Dv. Betul D.C.",
                zones: ["Betul Town-II", "Betul Urban", "Betul Rural", "Athner"],
              },
              {
                name: "Betul North",
                executiveEngineerLine: "Betul Dv. Betul D.C.",
                zones: ["Multai", "Amla", "Bhainsdehi"],
              },
            ],
          },
          {
            name: "Bhopal Circle",
            divisions: [
              {
                name: "Bhopal City",
                executiveEngineerLine: "Bhopal Dv. Bhopal D.C.",
                zones: ["Kolar", "Govindpura", "Berasia"],
              },
            ],
          },
          {
            name: "Hoshangabad Circle",
            divisions: [
              {
                name: "Hoshangabad",
                executiveEngineerLine: "Hoshangabad Dv. Hoshangabad D.C.",
                zones: ["Itarsi", "Pipariya"],
              },
            ],
          },
        ],
      },
      {
        name: "Gwalior",
        circles: [
          {
            name: "Gwalior Circle",
            divisions: [
              {
                name: "Gwalior City",
                executiveEngineerLine: "Gwalior Dv. Gwalior D.C.",
                zones: ["Morar", "Lashkar"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    /**
     * The neighbouring DISCOMs. Present so a project outside MPCZ can be
     * raised without a code change; their zone lists fill in when the first
     * job actually lands in one.
     */
    code: "MPPKVVCL",
    name: "Madhya Pradesh Paschim Kshetra Vidyut Vitaran Co. Ltd",
    zoneWord: "Paschim",
    nameChangeUrl: "https://portal.mpwz.co.in",
    loadEnhancementUrl: "https://portal.mpwz.co.in",
    meterPortalUrl: "https://rooftop.mpwz.co.in",
    landRecordsUrl: "https://webgis2.mpbhulekh.gov.in/#/home/bhu-abhilekh",
    regions: [
      {
        name: "Indore",
        circles: [
          {
            name: "Indore Circle",
            divisions: [
              {
                name: "Indore City",
                executiveEngineerLine: "Indore Dv. Indore D.C.",
                zones: ["Vijay Nagar", "Rajendra Nagar"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "MPPoKVVCL",
    name: "Madhya Pradesh Poorv Kshetra Vidyut Vitaran Co. Ltd",
    zoneWord: "Poorv",
    nameChangeUrl: "https://portal.mpez.co.in",
    loadEnhancementUrl: "https://portal.mpez.co.in",
    meterPortalUrl: "https://rooftop.mpez.co.in",
    landRecordsUrl: "https://webgis2.mpbhulekh.gov.in/#/home/bhu-abhilekh",
    regions: [
      {
        name: "Jabalpur",
        circles: [
          {
            name: "Jabalpur Circle",
            divisions: [
              {
                name: "Jabalpur City",
                executiveEngineerLine: "Jabalpur Dv. Jabalpur D.C.",
                zones: ["Adhartal", "Ranjhi"],
              },
            ],
          },
        ],
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function tally(created: number, skipped: number): string {
  return created === 0 ? `up to date (${skipped})` : `+${created} new, ${skipped} already there`;
}

/** Inserts the names that are not present yet. Never updates or deletes. */
async function seedNames(
  // The name-only master tables are structurally identical, so one function
  // covers all five; the shared shape is narrower than any one table, which is
  // why the cast sits at this boundary rather than at each call site.
  table: unknown,
  names: readonly string[],
): Promise<{ created: number; skipped: number }> {
  const t = table as typeof banks;
  const existing = await db.select({ name: t.name }).from(t);
  const have = new Set(existing.map((r) => r.name));
  const missing = names.filter((n) => !have.has(n));

  if (missing.length > 0) {
    await db.insert(t).values(missing.map((name) => ({ name })));
  }
  return { created: missing.length, skipped: names.length - missing.length };
}

// ── Seeders ───────────────────────────────────────────────────────────────

async function seedCompany(): Promise<string> {
  const existing = await db.select({ id: companyBranches.id }).from(companyBranches).limit(1);
  if (existing.length > 0) return "already there";

  await db.insert(companyBranches).values({
    id: "branch_betul",
    name: "Betul",
    companyName: "BHIM ENERGY SOLUTIONS",
    isDefault: true,
    addressLine: "Near Delivery Office, Athner Road, Badora",
    city: "Betul",
    pinCode: "460001",
    phones: "7000295100, 9826983922",
    email: "bhimenergysolutions@gmail.com",
    gstin: "23CCYPS1427F1ZC",
    signatoryName: "Kunda Solanki",
    signatoryDesignation: "Proprietor",
    signatoryPhone: "7798177838",
    // Printed as the Bank Details block on every quotation.
    bankName: "Indian Overseas Bank, Betul Branch",
    bankAccountNo: "378202000000316",
    bankIfsc: "IOBA0003782",
    bankAccountType: "Current",
  });
  return "created";
}

async function seedPanelModels(): Promise<string> {
  const companies = await db
    .select({ id: panelCompanies.id, name: panelCompanies.name })
    .from(panelCompanies);
  const byName = new Map(companies.map((c) => [c.name, c.id]));

  const wanted = Object.entries(PANEL_MODELS).flatMap(([company, models]) => {
    const companyId = byName.get(company);
    // A model whose company is missing would violate the foreign key. Skipping
    // it is better than failing the whole seed over one typo in the list.
    if (companyId === undefined) return [];
    return models.map((m) => ({ ...m, companyId }));
  });

  const existing = await db
    .select({ companyId: panelModels.companyId, modelNo: panelModels.modelNo })
    .from(panelModels);
  const have = new Set(existing.map((r) => `${r.companyId}|${r.modelNo}`));

  const missing = wanted.filter((m) => !have.has(`${m.companyId}|${m.modelNo}`));
  if (missing.length > 0) await db.insert(panelModels).values(missing);

  return tally(missing.length, wanted.length - missing.length);
}

async function seedInverters(): Promise<string> {
  const existing = await db
    .select({ manufacturer: inverterModels.manufacturer, modelNo: inverterModels.modelNo })
    .from(inverterModels);
  const have = new Set(existing.map((r) => `${r.manufacturer}|${r.modelNo}`));

  const missing = INVERTERS.filter((i) => !have.has(`${i.manufacturer}|${i.modelNo}`));
  if (missing.length > 0) await db.insert(inverterModels).values(missing);

  return tally(missing.length, INVERTERS.length - missing.length);
}

async function seedPlantSizes(): Promise<string> {
  const existing = await db.select({ kw: plantSizes.kw }).from(plantSizes);
  // numeric comes back as a string, so compare on the formatted value —
  // otherwise "5" and "5.00" look like two different sizes.
  const have = new Set(existing.map((r) => Number(r.kw).toFixed(2)));

  const missing = PLANT_SIZES.filter((kw) => !have.has(kw.toFixed(2))).map((kw) => ({
    kw: kw.toFixed(2),
    label: `${kw} kW`,
  }));
  if (missing.length > 0) await db.insert(plantSizes).values(missing);

  return tally(missing.length, PLANT_SIZES.length - missing.length);
}

/**
 * The DISCOM tree, level by level.
 *
 * Each level is matched on its name within its parent, so a half-seeded tree —
 * an interrupted run, or a zone added by hand — fills in rather than
 * duplicating. None of these tables has a unique constraint, which is why each
 * check is a select rather than an upsert.
 */
async function seedDiscoms(): Promise<string> {
  let created = 0;
  let skipped = 0;

  for (const d of DISCOMS) {
    let [company] = await db
      .select()
      .from(discomCompanies)
      .where(eq(discomCompanies.code, d.code))
      .limit(1);

    if (!company) {
      [company] = await db
        .insert(discomCompanies)
        .values({
          code: d.code,
          name: d.name,
          zoneWord: d.zoneWord,
          nameChangeUrl: d.nameChangeUrl,
          loadEnhancementUrl: d.loadEnhancementUrl,
          meterPortalUrl: d.meterPortalUrl,
          landRecordsUrl: d.landRecordsUrl,
        })
        .returning();
      created++;
    } else {
      skipped++;
    }

    for (const r of d.regions) {
      let [region] = await db
        .select()
        .from(discomRegions)
        .where(and(eq(discomRegions.companyId, company!.id), eq(discomRegions.name, r.name)))
        .limit(1);

      if (!region) {
        [region] = await db
          .insert(discomRegions)
          .values({ companyId: company!.id, name: r.name })
          .returning();
        created++;
      } else {
        skipped++;
      }

      for (const c of r.circles) {
        let [circle] = await db
          .select()
          .from(discomCircles)
          .where(and(eq(discomCircles.regionId, region!.id), eq(discomCircles.name, c.name)))
          .limit(1);

        if (!circle) {
          [circle] = await db
            .insert(discomCircles)
            .values({ regionId: region!.id, name: c.name })
            .returning();
          created++;
        } else {
          skipped++;
        }

        for (const dv of c.divisions) {
          let [division] = await db
            .select()
            .from(discomDivisions)
            .where(and(eq(discomDivisions.circleId, circle!.id), eq(discomDivisions.name, dv.name)))
            .limit(1);

          if (!division) {
            [division] = await db
              .insert(discomDivisions)
              .values({
                circleId: circle!.id,
                name: dv.name,
                executiveEngineerLine: dv.executiveEngineerLine,
              })
              .returning();
            created++;
          } else {
            skipped++;
          }

          const existingZones = await db
            .select({ name: discomZones.name })
            .from(discomZones)
            .where(eq(discomZones.divisionId, division!.id));
          const have = new Set(existingZones.map((z) => z.name));
          const missingZones = dv.zones.filter((z) => !have.has(z));

          if (missingZones.length > 0) {
            await db
              .insert(discomZones)
              .values(missingZones.map((name) => ({ divisionId: division!.id, name })));
          }
          created += missingZones.length;
          skipped += dv.zones.length - missingZones.length;
        }
      }
    }
  }

  return tally(created, skipped);
}

async function seedAdmin(): Promise<string> {
  const existing = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    // The account survives a re-run untouched. The one exception is the role:
    // an admin who somehow lost it would lock everybody out of user
    // management, and repairing that is safe. The password is never reset.
    if (existing[0]!.role !== "ADMIN") {
      await db.update(user).set({ role: "ADMIN" }).where(eq(user.email, ADMIN_EMAIL));
      return "already there (role restored to ADMIN)";
    }
    return "already there";
  }

  // Created through Better Auth so the password is hashed exactly as a real
  // sign-up would hash it — never by writing a hash by hand, which is how an
  // account ends up unable to sign in after a library upgrade.
  await auth.api.signUpEmail({
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME },
  });

  // `role` is `input: false` in the auth config, so it cannot be set from a
  // sign-up payload — deliberately, since that is what stops anyone from
  // asking for ADMIN. It is written here instead.
  await db
    .update(user)
    .set({ role: "ADMIN", phone: ADMIN_PHONE, active: true })
    .where(eq(user.email, ADMIN_EMAIL));

  return "created";
}

// ── Entry point ───────────────────────────────────────────────────────────

async function main() {
  const [row] = await sql<{ db: string }[]>`select current_database() as db`;
  console.log(`Seeding BHIM CRM into "${row?.db ?? "?"}"…\n`);

  console.log(`  company branch     ${await seedCompany()}`);

  for (const m of NAME_MASTERS) {
    const { created, skipped } = await seedNames(m.table, m.names);
    console.log(`  ${m.label.padEnd(18)} ${tally(created, skipped)}`);
  }

  console.log(`  panel models       ${await seedPanelModels()}`);
  console.log(`  inverter models    ${await seedInverters()}`);
  console.log(`  plant sizes        ${await seedPlantSizes()}`);
  console.log(`  discom hierarchy   ${await seedDiscoms()}`);
  console.log(`  admin account      ${await seedAdmin()}`);

  console.log(`\nSign in with:\n  ${ADMIN_EMAIL}\n  ${ADMIN_PASSWORD}`);

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(
      "\n  !  That password is the default and it is written in the repository.\n" +
        "     Change it from Settings -> Password before the URL reaches anyone else.",
    );
  }

  console.log(
    "\nDocument templates are deliberately not seeded: each one is a .docx that\n" +
      "has to be uploaded through Admin -> Templates, which stores the file in\n" +
      "S3 and records its key and version.\n",
  );

  await sql.end();
}

main().catch(async (err) => {
  console.error("\nSeed failed:\n", err);
  await sql.end().catch(() => {});
  process.exit(1);
});
