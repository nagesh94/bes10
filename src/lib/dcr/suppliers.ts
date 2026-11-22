import { asc, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dcrCertificates, suppliers } from "@/lib/db/schema";
import type { SupplierRow } from "@/components/dcr/supplier-manager";

/** Suppliers with how many certificates each has issued, active first. */
export async function loadSupplierRows(): Promise<SupplierRow[]> {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      gstin: suppliers.gstin,
      pan: suppliers.pan,
      address: suppliers.address,
      state: suppliers.state,
      pincode: suppliers.pincode,
      phone: suppliers.phone,
      email: suppliers.email,
      active: suppliers.active,
      certificates: sql<number>`(select count(*)::int from ${dcrCertificates} where ${dcrCertificates.supplierId} = ${suppliers.id})`,
    })
    .from(suppliers)
    .orderBy(desc(suppliers.active), asc(suppliers.name));
}
