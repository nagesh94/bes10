import { notFound } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { DcrTabs } from "@/components/dcr/dcr-tabs";
import { SupplierManager } from "@/components/dcr/supplier-manager";
import { loadSupplierRows } from "@/lib/dcr/suppliers";

export default async function DcrSuppliersPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "document.read")) notFound();

  const rows = await loadSupplierRows();

  return (
    <main className="mx-auto max-w-[1000px] px-4 pt-7 pb-14 sm:px-6">
      <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Panel suppliers</h1>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Who sells us the modules and issues their DCR certificates. Matched to an uploaded certificate by GSTIN.
      </p>
      <DcrTabs active="suppliers" />
      <SupplierManager
        rows={rows}
        canAdd={can(actor, "document.upload")}
        canEdit={can(actor, "admin.masterdata")}
      />
    </main>
  );
}
