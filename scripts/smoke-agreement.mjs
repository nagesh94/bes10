/**
 * Builds a vendor agreement .docx for the Varsha Azad project, so the output
 * can be compared against the signed copy that already exists.
 *
 *   npx tsx scripts/smoke-agreement.mjs
 *
 * Writes to .tmp/agreement-test.docx; the shell checks the contents.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAgreementDocx } from "../src/lib/documents/agreement.ts";

const buf = await buildAgreementDocx({
  executionDate: new Date("2026-07-06"),
  consumer: {
    title: "Mrs.",
    name: "Varsha Azad",
    address: "Gurusahab colony, Athner road, Badora, Betul, M.P., 460001",
  },
  vendor: {
    name: "BHIM ENERGY SOLUTIONS",
    address: "Near Delivery Office, Athner road, Badora, Betul MP 460001",
  },
  totalValue: 220000,
  schedule: [
    { label: "as an advance on confirmation of the order", amount: 66000, percent: 30 },
    { label: "against Proforma Invoice (PI) before dispatch", amount: 132000, percent: 60 },
    { label: "after installation and commissioning of the RTS System", amount: 22000, percent: 10 },
  ],
});

const dir = resolve(process.cwd(), ".tmp");
mkdirSync(dir, { recursive: true });
const out = resolve(dir, "agreement-test.docx");
writeFileSync(out, buf);

const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
console.log(`bytes=${buf.byteLength} zip=${isZip} path=${out}`);
