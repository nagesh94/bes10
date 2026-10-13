/**
 * Seeds the local database.
 *
 * The master data below is real — it comes out of the Betul project documents
 * (Krishni Nagde, NP-MPMK26-14534479), so the first generated document can be
 * checked against a known-good one rather than against invented values.
 *
 *   npm run db:seed
 *
 * Safe to re-run: every insert is skipped if the row already exists.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "./index";
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

const ADMIN_EMAIL = "admin@bhimenergy.in";
const ADMIN_PASSWORD = "BhimLocal2026!";

async function isEmpty(table: Parameters<typeof db.select>[0] extends never ? never : any) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return (row?.n ?? 0) === 0;
}

async function seedCompany() {
  if (!(await isEmpty(companyBranches))) return "skipped";

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

async function seedDiscom() {
  if (!(await isEmpty(discomCompanies))) return "skipped";

  // Madhya Pradesh Madhya Kshetra Vidyut Vitaran Co. Ltd — "MPCZ".
  // The work completion report asks you to strike through two of
  // Madhya / Paschim / Poorv; zoneWord picks the right one.
  const [company] = await db
    .insert(discomCompanies)
    .values({
      code: "MPMKVVCL",
      name: "Madhya Pradesh Madhya Kshetra Vidyut Vitaran Co. Ltd",
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
    })
    .returning();

  const [region] = await db
    .insert(discomRegions)
    .values({ companyId: company!.id, name: "Bhopal" })
    .returning();

  const [circle] = await db
    .insert(discomCircles)
    .values({ regionId: region!.id, name: "Betul Circle" })
    .returning();

  const [division] = await db
    .insert(discomDivisions)
    .values({
      circleId: circle!.id,
      name: "Betul South",
      executiveEngineerLine: "Betul Dv. Betul D.C.",
    })
    .returning();

  await db.insert(discomZones).values([
    { divisionId: division!.id, name: "Betul Town-II" },
    { divisionId: division!.id, name: "Betul Urban" },
  ]);

  return "created";
}

async function seedPanels() {
  if (!(await isEmpty(panelCompanies))) return "skipped";

  const companies = await db
    .insert(panelCompanies)
    .values([
      { name: "Waaree Energies Limited" },
      { name: "Vikram Solar" },
      { name: "Adani Solar" },
      { name: "Tata Power Solar" },
      { name: "Jinko Solar" },
      { name: "Goldi Solar" },
      { name: "Premier Energies" },
      { name: "RenewSys" },
    ])
    .returning();

  const waaree = companies.find((c) => c.name.startsWith("Waaree"))!;
  const vikram = companies.find((c) => c.name === "Vikram Solar")!;
  const adani = companies.find((c) => c.name === "Adani Solar")!;
  const tata = companies.find((c) => c.name === "Tata Power Solar")!;
  const jinko = companies.find((c) => c.name === "Jinko Solar")!;

  await db.insert(panelModels).values([
    // The model actually installed at Betul.
    { companyId: waaree.id, modelNo: "BiN-08-535", wattPeak: 535, isDcr: true },
    { companyId: waaree.id, modelNo: "WSMD-545", wattPeak: 545, isDcr: true },
    { companyId: waaree.id, modelNo: "WSMD-585", wattPeak: 585, isDcr: true },
    { companyId: vikram.id, modelNo: "VSMDG-540", wattPeak: 540, isDcr: true },
    { companyId: adani.id, modelNo: "AS-7M144", wattPeak: 550, isDcr: true },
    { companyId: tata.id, modelNo: "TP6L60M", wattPeak: 450, isDcr: true },
    { companyId: jinko.id, modelNo: "JKM-575N", wattPeak: 575, isDcr: false },
  ]);

  return "created";
}

async function seedInverters() {
  if (!(await isEmpty(inverterModels))) return "skipped";

  await db.insert(inverterModels).values([
    // The inverter actually installed at Betul.
    { manufacturer: "Polycab", brandName: "Polycab", modelNo: "PSIS-5K0", capacityKw: "5.00" },
    { manufacturer: "Polycab", brandName: "Polycab", modelNo: "PSIS-3K0", capacityKw: "3.00" },
    { manufacturer: "Deye", brandName: "Deye", modelNo: "SUN-3K-SG04LP1", capacityKw: "3.00" },
    { manufacturer: "Deye", brandName: "Deye", modelNo: "SUN-5K-SG04LP1", capacityKw: "5.00" },
    { manufacturer: "Growatt", brandName: "Growatt", modelNo: "MIN 5000TL-X", capacityKw: "5.00" },
    { manufacturer: "Luminous", brandName: "Luminous", modelNo: "NXG+ 5kW", capacityKw: "5.00" },
    { manufacturer: "Microtek", brandName: "Microtek", modelNo: "Gridsol 3kW", capacityKw: "3.00" },
  ]);

  return "created";
}

async function seedSimpleMasters() {
  const results: string[] = [];

  if (await isEmpty(structureCompanies)) {
    await db
      .insert(structureCompanies)
      .values([{ name: "Shakti Fabricators" }, { name: "Local fabrication" }]);
    results.push("structure");
  }

  if (await isEmpty(banks)) {
    await db.insert(banks).values([
      { name: "State Bank of India" },
      { name: "Punjab National Bank" },
      { name: "Bank of Baroda" },
      { name: "Union Bank of India" },
      { name: "Central Bank of India" },
    ]);
    results.push("banks");
  }

  if (await isEmpty(cableMakes)) {
    await db.insert(cableMakes).values([
      { name: "Polycab" },
      { name: "Havells" },
      { name: "KEI Industries" },
      { name: "Finolex Cables" },
      { name: "RR Kabel" },
      { name: "Anchor Electricals" },
    ]);
    results.push("cableMakes");
  }

  if (await isEmpty(plantSizes)) {
    await db.insert(plantSizes).values(
      [1, 2, 3, 4, 5, 6, 8, 10].map((kw) => ({
        kw: kw.toFixed(2),
        label: `${kw} kW`,
      })),
    );
    results.push("plantSizes");
  }

  if (await isEmpty(panelTypes)) {
    // The module technologies actually sold in the residential rooftop
    // market today — not an exhaustive list, just enough that staff rarely
    // need to type one in by hand.
    await db.insert(panelTypes).values([
      { name: "Mono PERC" },
      { name: "Polycrystalline" },
      { name: "Bifacial Mono PERC" },
      { name: "TOPCon" },
      { name: "HJT (Heterojunction)" },
      { name: "N-Type Mono" },
      { name: "Thin Film (CdTe)" },
    ]);
    results.push("panelTypes");
  }

  return results.length ? results.join(", ") : "skipped";
}

async function seedAdmin() {
  const existing = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1);
  if (existing.length > 0) return "skipped";

  // Created through Better Auth so the password is hashed the same way a
  // real sign-up would hash it — never by writing the hash by hand.
  await auth.api.signUpEmail({
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: "Kunda Solanki" },
  });

  await db
    .update(user)
    .set({ role: "ADMIN", phone: "7798177838" })
    .where(eq(user.email, ADMIN_EMAIL));

  return "created";
}

async function main() {
  console.log("Seeding BHIM CRM…\n");

  console.log(`  company branch   ${await seedCompany()}`);
  console.log(`  discom hierarchy ${await seedDiscom()}`);
  console.log(`  panels           ${await seedPanels()}`);
  console.log(`  inverters        ${await seedInverters()}`);
  console.log(`  other masters    ${await seedSimpleMasters()}`);
  console.log(`  admin account    ${await seedAdmin()}`);

  console.log(`\nSign in with:\n  ${ADMIN_EMAIL}\n  ${ADMIN_PASSWORD}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nSeed failed:\n", err);
  process.exit(1);
});
