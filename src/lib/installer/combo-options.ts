import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inverterModels, panelCompanies, panelModels } from "@/lib/db/schema";

/**
 * Suggestion lists for the stage 3 installation form's panel/inverter fields.
 * Master data, but typing something not on the list is always allowed — the
 * office adds it manually and it just isn't a shortcut yet.
 */
export async function loadInstallationComboOptions(): Promise<Record<string, string[]>> {
  const [companies, models, inverters] = await Promise.all([
    db
      .select({ name: panelCompanies.name })
      .from(panelCompanies)
      .where(eq(panelCompanies.active, true))
      .orderBy(asc(panelCompanies.name)),
    db
      .select({ modelNo: panelModels.modelNo })
      .from(panelModels)
      .where(eq(panelModels.active, true))
      .orderBy(asc(panelModels.modelNo)),
    db
      .select({ manufacturer: inverterModels.manufacturer, modelNo: inverterModels.modelNo })
      .from(inverterModels)
      .where(eq(inverterModels.active, true)),
  ]);

  return {
    panelCompanies: companies.map((c) => c.name),
    panelModels: [...new Set(models.map((m) => m.modelNo))].sort(),
    inverterManufacturers: [...new Set(inverters.map((i) => i.manufacturer))].sort(),
    inverterModels: [...new Set(inverters.map((i) => i.modelNo))].sort(),
  };
}
