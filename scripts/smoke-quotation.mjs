/**
 * Rebuilds the Chanda Giri quotation from the data that produced it, so the
 * generated PDF can be put side by side with the original the office sent.
 *
 *   npx tsx scripts/smoke-quotation.mjs
 *
 * Writes .tmp/quotation-test.pdf. Nothing here touches the database.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQuotationPdf } from "../src/lib/quotations/pdf.ts";
import { DEFAULT_MILESTONES } from "../src/lib/quotations/content.ts";

const buf = await buildQuotationPdf({
  number: "BHIM100000",
  date: new Date("2026-06-15T00:00:00"),
  consumer: {
    title: "",
    name: "Chanda Giri",
    address: "Badora, Betul, M.P.",
    phone: "9826983922",
  },
  capacityKwp: 3,
  systemType: "ON_GRID",
  meteringPolicy: "M.P. Net / Smart Metering Policy",
  totalAmount: 220000,
  vendor: {
    name: "BHIM ENERGY SOLUTIONS",
    address: "Near Delivery Office, Athner Road, Badora, Betul (MP)",
    phones: "7798177838, 9826983922",
    email: "bhimenergysolutions@gmail.com",
    gstin: "23CCYPS1427F1ZC",
  },
  bank: {
    name: "Indian Overseas Bank, Betul Branch",
    accountNo: "378202000000316",
    ifsc: "IOBA0003782",
    accountType: "Current",
  },
  signatoryName: "Kunda Solanki",
  items: [
    {
      description: "Solar Structure",
      qty: "1 Set",
      make: "JSW Galvanized Structure",
      remark: "Design as per Site preference and wind Speed",
    },
    {
      description: "Solar Panel 540w Monocot Bifacial",
      qty: "3.24 kw",
      make: "Waaree",
      remark: "90% Performance at the end of 12th Year and 80% performance at the end of 30th Year",
    },
    {
      description: "On Grid Inverter",
      qty: "1 No.",
      make: "Polycab",
      remark: "The solar Inverter Warranty Would be 7 to 10 Years from the date of invoice.",
    },
    {
      description: "ACDB/DCDB",
      qty: "1 set",
      make: "Havells",
      remark: "As per State Electricity Board Guidelines.",
    },
    {
      description: "AC, DC (4sqmm cu) and Earthing Cable (4sqmm Cu)",
      qty: "In Meter",
      make: "POLYCAB",
      remark: "As per State Electricity Board Guidelines.",
    },
    {
      description: "LA & Earthing",
      qty: "1 set",
      make: "As per requirement",
      remark: "As per State Electricity Board Guidelines.",
    },
    {
      description: "Energy Meter",
      qty: "1 No.",
      make: "Secure (Bi Directional)",
      remark: "As per State Electricity Board Guidelines.",
    },
  ],
  milestones: [...DEFAULT_MILESTONES],
});

const out = resolve(process.cwd(), ".tmp", "quotation-test.pdf");
mkdirSync(resolve(process.cwd(), ".tmp"), { recursive: true });
writeFileSync(out, buf);
console.log(`wrote ${out} — ${(buf.length / 1024).toFixed(1)} KB`);
