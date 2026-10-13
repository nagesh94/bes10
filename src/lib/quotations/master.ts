import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inverterModels,
  panelCompanies,
  panelModels,
  plantSizes,
  structureCompanies,
} from "@/lib/db/schema";
import type { MasterOptions } from "./form-values";

/**
 * The dropdown contents for the quotation form.
 *
 * Read from the same master tables the installation record uses, so a panel
 * added under Admin is quotable the same afternoon with no deploy. Inactive
 * rows are left out: a discontinued panel should not be offered to a new
 * customer, but quotations that already name it keep their text, because
 * what prints lives on the quotation's own rows.
 */
export async function quotationMasterOptions(): Promise<MasterOptions> {
  const [structures, panels, inverters, sizes] = await Promise.all([
    db
      .select({ name: structureCompanies.name })
      .from(structureCompanies)
      .where(eq(structureCompanies.active, true))
      .orderBy(asc(structureCompanies.name)),
    db
      .select({
        company: panelCompanies.name,
        modelNo: panelModels.modelNo,
        wattPeak: panelModels.wattPeak,
      })
      .from(panelModels)
      .innerJoin(panelCompanies, eq(panelModels.companyId, panelCompanies.id))
      .where(eq(panelModels.active, true))
      .orderBy(asc(panelCompanies.name), asc(panelModels.wattPeak)),
    db
      .select({
        manufacturer: inverterModels.manufacturer,
        brandName: inverterModels.brandName,
        modelNo: inverterModels.modelNo,
        capacityKw: inverterModels.capacityKw,
      })
      .from(inverterModels)
      .where(eq(inverterModels.active, true))
      .orderBy(asc(inverterModels.manufacturer), asc(inverterModels.capacityKw)),
    db
      .select({ kw: plantSizes.kw, label: plantSizes.label })
      .from(plantSizes)
      .where(eq(plantSizes.active, true))
      .orderBy(asc(plantSizes.kw)),
  ]);

  return {
    structures: structures.map((s) => s.name),
    panels,
    inverters: inverters.map((i) => ({
      manufacturer: i.brandName ?? i.manufacturer,
      modelNo: i.modelNo,
      label: `${i.brandName ?? i.manufacturer} ${i.modelNo} · ${i.capacityKw} kW`,
    })),
    plantSizes: sizes.map((s) => ({ kw: String(Number(s.kw)), label: s.label })),
  };
}
