import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, gstBillItems, gstBills, projects, suppliers, user } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Reading GST bills for the finance pages. Behind `money.read`, like every
 * other figure in the section.
 *
 * Amounts come back as numbers, and a credit note's are negated (`sign`), so
 * a page can add bills up without knowing which ones reduce the total.
 */

const n = (v: string | null) => Number(v ?? 0);

export async function loadGstBills() {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const rows = await db
    .select({
      id: gstBills.id,
      direction: gstBills.direction,
      docType: gstBills.docType,
      invoiceNo: gstBills.invoiceNo,
      invoiceDate: gstBills.invoiceDate,
      supplierId: gstBills.supplierId,
      supplierName: suppliers.name,
      partyName: gstBills.partyName,
      partyGstin: gstBills.partyGstin,
      projectId: gstBills.projectId,
      projectCode: projects.code,
      taxableValue: gstBills.taxableValue,
      cgst: gstBills.cgst,
      sgst: gstBills.sgst,
      igst: gstBills.igst,
      cess: gstBills.cess,
      total: gstBills.total,
      itcEligible: gstBills.itcEligible,
      reverseCharge: gstBills.reverseCharge,
      hasFile: gstBills.s3Key,
      fileName: gstBills.fileName,
    })
    .from(gstBills)
    .leftJoin(suppliers, eq(suppliers.id, gstBills.supplierId))
    .leftJoin(projects, eq(projects.id, gstBills.projectId))
    .where(isNull(gstBills.deletedAt))
    .orderBy(desc(gstBills.invoiceDate), desc(gstBills.id));

  return rows.map((r) => {
    const sign = r.docType === "credit_note" ? -1 : 1;
    const cgst = sign * n(r.cgst);
    const sgst = sign * n(r.sgst);
    const igst = sign * n(r.igst);
    const cess = sign * n(r.cess);
    return {
      ...r,
      party: r.supplierName ?? r.partyName,
      hasFile: Boolean(r.hasFile),
      sign,
      taxableValue: sign * n(r.taxableValue),
      cgst,
      sgst,
      igst,
      cess,
      tax: cgst + sgst + igst + cess,
      total: sign * n(r.total),
    };
  });
}

export type GstBillRow = Awaited<ReturnType<typeof loadGstBills>>[number];

export async function loadGstBill(id: number) {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const [row] = await db
    .select({
      bill: gstBills,
      supplier: suppliers,
      projectCode: projects.code,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      uploader: user.name,
    })
    .from(gstBills)
    .leftJoin(suppliers, eq(suppliers.id, gstBills.supplierId))
    .leftJoin(projects, eq(projects.id, gstBills.projectId))
    .leftJoin(contacts, eq(contacts.id, projects.contactId))
    .leftJoin(user, eq(user.id, gstBills.uploadedBy))
    .where(and(eq(gstBills.id, id), isNull(gstBills.deletedAt)))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select()
    .from(gstBillItems)
    .where(eq(gstBillItems.billId, id))
    .orderBy(asc(gstBillItems.sortOrder));

  return { ...row, items };
}

/** What the upload form picks from: active suppliers and every project. */
export async function loadGstFormOptions() {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const [supplierRows, projectRows] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name, gstin: suppliers.gstin })
      .from(suppliers)
      .where(eq(suppliers.active, true))
      .orderBy(asc(suppliers.name)),
    db
      .select({ id: projects.id, code: projects.code, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(projects)
      .innerJoin(contacts, eq(contacts.id, projects.contactId))
      .orderBy(desc(projects.code)),
  ]);

  return {
    suppliers: supplierRows,
    projects: projectRows.map((p) => ({
      id: p.id,
      label: `${p.code} · ${[p.firstName, p.lastName].filter(Boolean).join(" ")}`,
    })),
  };
}
