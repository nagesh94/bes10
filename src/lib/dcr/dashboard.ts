import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contacts,
  dcrCertificates,
  dcrSerials,
  flags,
  installations,
  panelSerials,
  projects,
  suppliers,
} from "@/lib/db/schema";
import { computeStats, type CertRow, type SerialRow } from "./dashboard-math";
import type { DcrFlagDetail } from "./matching";

export interface DashboardFilters {
  from: string;
  to: string;
  supplier: number | null;
  manufacturer: string;
  model: string;
  wp: number | null;
  tech: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the filters off the query string; anything malformed is simply ignored. */
export function readFilters(sp: Record<string, string | string[] | undefined>): DashboardFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const num = (k: string) => {
    const n = Number(one(k));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const from = one("from");
  const to = one("to");
  return {
    from: DATE.test(from) ? from : "",
    to: DATE.test(to) ? to : "",
    supplier: num("supplier"),
    manufacturer: one("manufacturer").slice(0, 200),
    model: one("model").slice(0, 100),
    wp: num("wp"),
    tech: one("tech").slice(0, 60),
  };
}

export function hasFilters(f: DashboardFilters): boolean {
  return Boolean(f.from || f.to || f.supplier || f.manufacturer || f.model || f.wp || f.tech);
}

const normalisedPanelSerial = sql<string>`upper(regexp_replace(${panelSerials.serialNo}, '\\s', '', 'g'))`;

export async function loadDashboard(f: DashboardFilters, today: string) {
  const where = and(
    f.from ? gte(dcrCertificates.certDate, f.from) : undefined,
    f.to ? lte(dcrCertificates.certDate, f.to) : undefined,
    f.supplier ? eq(dcrCertificates.supplierId, f.supplier) : undefined,
    f.manufacturer ? eq(dcrCertificates.moduleManufacturer, f.manufacturer) : undefined,
    f.model ? eq(dcrCertificates.modelNo, f.model) : undefined,
    f.wp ? eq(dcrCertificates.wattPeak, f.wp) : undefined,
    f.tech ? eq(dcrCertificates.technology, f.tech) : undefined,
  );

  const [certRows, options, flagRows] = await Promise.all([
    db
      .select({
        id: dcrCertificates.id,
        certificateNo: dcrCertificates.certificateNo,
        certDate: dcrCertificates.certDate,
        supplierId: dcrCertificates.supplierId,
        supplier: suppliers.name,
        moduleManufacturer: dcrCertificates.moduleManufacturer,
        modelNo: dcrCertificates.modelNo,
        wattPeak: dcrCertificates.wattPeak,
        purchaseOrderNo: dcrCertificates.purchaseOrderNo,
      })
      .from(dcrCertificates)
      .leftJoin(suppliers, eq(dcrCertificates.supplierId, suppliers.id))
      .where(where)
      .orderBy(asc(dcrCertificates.certDate), asc(dcrCertificates.id)),
    loadOptions(),
    // Not narrowed by the certificate filters: a serial with no certificate
    // belongs to none of them, and these are the cases that need action.
    db
      .select({
        flagId: flags.id,
        status: flags.status,
        detail: flags.detail,
        detectedAt: flags.detectedAt,
        projectId: projects.id,
        code: projects.code,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(flags)
      .innerJoin(projects, eq(flags.projectId, projects.id))
      .leftJoin(contacts, eq(projects.contactId, contacts.id))
      .where(and(eq(flags.type, "DCR_SERIAL_MISMATCH"), sql`${flags.status} in ('OPEN','IN_PROGRESS')`))
      .orderBy(desc(flags.detectedAt)),
  ]);

  const ids = certRows.map((c) => c.id);
  const serialRows: SerialRow[] = ids.length
    ? await db
        .select({
          certificateId: dcrSerials.certificateId,
          serialNo: dcrSerials.serialNo,
          wattPeak: dcrSerials.wattPeak,
          projectId: panelSerials.projectId,
          installationDate: installations.installationDate,
        })
        .from(dcrSerials)
        .leftJoin(panelSerials, eq(normalisedPanelSerial, dcrSerials.serialNo))
        .leftJoin(installations, eq(installations.projectId, panelSerials.projectId))
        .where(inArray(dcrSerials.certificateId, ids))
    : [];

  // The chart spans the filter's dates, or the last twelve months.
  const monthTo = (f.to || today).slice(0, 7);
  const monthFrom = f.from
    ? f.from.slice(0, 7)
    : (() => {
        const d = new Date(`${monthTo}-01T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - 11);
        return d.toISOString().slice(0, 7);
      })();

  const stats = computeStats(certRows as CertRow[], serialRows, { today, monthFrom, monthTo });

  const issues = flagRows.map((r) => {
    const d: Partial<DcrFlagDetail> = r.detail ? JSON.parse(r.detail) : {};
    return {
      projectId: r.projectId,
      code: r.code,
      customer: [r.firstName, r.lastName].filter(Boolean).join(" "),
      status: r.status,
      detectedAt: r.detectedAt,
      total: d.total ?? 0,
      missing: d.missing?.length ?? 0,
      elsewhere: d.elsewhere?.length ?? 0,
    };
  });

  // Oldest stock first: that is what should be fitted next.
  const stockTable = certRows
    .map((c) => ({ ...c, ...(stats.perCertificate.get(c.id) ?? { panels: 0, installed: 0, kw: 0, stockKw: 0 }) }))
    .filter((c) => c.panels - c.installed > 0);

  return { stats, issues, stockTable, options, monthFrom, monthTo };
}

async function loadOptions() {
  const distinct = async (col: typeof dcrCertificates.modelNo | typeof dcrCertificates.moduleManufacturer | typeof dcrCertificates.technology) =>
    (
      await db
        .selectDistinct({ v: col })
        .from(dcrCertificates)
        .where(isNotNull(col))
        .orderBy(asc(col))
    ).map((r) => r.v as string);

  const [supplierRows, manufacturers, models, techs, wps] = await Promise.all([
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    distinct(dcrCertificates.moduleManufacturer),
    distinct(dcrCertificates.modelNo),
    distinct(dcrCertificates.technology),
    db
      .selectDistinct({ v: dcrCertificates.wattPeak })
      .from(dcrCertificates)
      .where(isNotNull(dcrCertificates.wattPeak))
      .orderBy(asc(dcrCertificates.wattPeak)),
  ]);

  return {
    suppliers: supplierRows,
    manufacturers,
    models,
    techs,
    wps: wps.map((r) => r.v as number),
  };
}
