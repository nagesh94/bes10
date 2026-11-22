import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  dcrCertificates,
  dcrSerials,
  flags,
  installations,
  panelSerials,
  projects,
} from "@/lib/db/schema";
import { normaliseSerial } from "./fields";

export type SerialStatus = "matched" | "missing" | "elsewhere";

export interface SerialCheck {
  /** As typed. */
  serialNo: string;
  status: SerialStatus;
  certificateId: number | null;
  certificateNo: string | null;
  /** The Wp the certificate gives this module, for the badge's model check. */
  wattPeak: number | null;
  /** Other projects whose stage 3 already lists this serial. */
  otherProjects: { id: string; label: string }[];
}

/**
 * Looks each serial up against every stored certificate and every other
 * project's stage 3.
 *
 * "elsewhere" wins over "matched": a module certified for us but already
 * recorded on someone else's roof is the more urgent thing to see, because
 * one of the two projects is wrong.
 */
export async function checkSerials(projectId: string, serials: string[]): Promise<SerialCheck[]> {
  const typed = serials.map((s) => s.trim()).filter(Boolean);
  const wanted = [...new Set(typed.map(normaliseSerial))];
  if (wanted.length === 0) return [];

  const [certRows, usedRows] = await Promise.all([
    db
      .select({
        serialNo: dcrSerials.serialNo,
        wattPeak: dcrSerials.wattPeak,
        certificateId: dcrCertificates.id,
        certificateNo: dcrCertificates.certificateNo,
        certWattPeak: dcrCertificates.wattPeak,
      })
      .from(dcrSerials)
      .innerJoin(dcrCertificates, eq(dcrSerials.certificateId, dcrCertificates.id))
      .where(inArray(dcrSerials.serialNo, wanted)),
    db
      .select({
        serial: sql<string>`upper(regexp_replace(${panelSerials.serialNo}, '\\s', '', 'g'))`,
        projectId: projects.id,
        label: sql<string>`${projects.code} || coalesce(' · ' || ${contacts.firstName} || coalesce(' ' || ${contacts.lastName}, ''), '')`,
      })
      .from(panelSerials)
      .innerJoin(projects, eq(panelSerials.projectId, projects.id))
      .leftJoin(contacts, eq(projects.contactId, contacts.id))
      .where(
        and(
          ne(panelSerials.projectId, projectId),
          inArray(sql`upper(regexp_replace(${panelSerials.serialNo}, '\\s', '', 'g'))`, wanted),
        ),
      ),
  ]);

  const byCert = new Map(certRows.map((r) => [r.serialNo, r]));

  return typed.map((serialNo) => {
    const key = normaliseSerial(serialNo);
    const cert = byCert.get(key);
    const otherProjects = usedRows
      .filter((u) => u.serial === key)
      .map((u) => ({ id: u.projectId, label: u.label }));
    const status: SerialStatus = otherProjects.length ? "elsewhere" : cert ? "matched" : "missing";
    return {
      serialNo,
      status,
      certificateId: cert?.certificateId ?? null,
      certificateNo: cert?.certificateNo ?? null,
      wattPeak: cert?.wattPeak ?? cert?.certWattPeak ?? null,
      otherProjects,
    };
  });
}

export interface DcrFlagDetail {
  total: number;
  matched: number;
  missing: string[];
  elsewhere: { serialNo: string; projects: { id: string; label: string }[] }[];
  certificates: { id: number; certificateNo: string; count: number }[];
}

/** Summarises a project's checks — what the flag stores and the pages show. */
export function summarise(checks: SerialCheck[]): DcrFlagDetail {
  const certs = new Map<number, { id: number; certificateNo: string; count: number }>();
  for (const c of checks) {
    if (c.certificateId === null || c.certificateNo === null) continue;
    const entry = certs.get(c.certificateId) ?? { id: c.certificateId, certificateNo: c.certificateNo, count: 0 };
    entry.count += 1;
    certs.set(c.certificateId, entry);
  }
  return {
    total: checks.length,
    matched: checks.filter((c) => c.status === "matched").length,
    missing: checks.filter((c) => c.status === "missing").map((c) => c.serialNo),
    elsewhere: checks
      .filter((c) => c.status === "elsewhere")
      .map((c) => ({ serialNo: c.serialNo, projects: c.otherProjects })),
    certificates: [...certs.values()].sort((a, b) => b.count - a.count),
  };
}

/**
 * Brings one project's DCR state up to date with its panel serials.
 *
 * 1. Raises, updates, reopens or resolves the DCR_SERIAL_MISMATCH flag. A
 *    waived flag is left alone — the waiver is a decision, not a state.
 * 2. Fills the four DCR-undertaking fields from the certificate that covers
 *    the most of this project's panels, but only where they are still empty,
 *    so anything typed by hand on stage 7 is never overwritten.
 *
 * Run after the serials change, and for every affected project after a
 * certificate is saved or deleted.
 */
export async function syncProjectDcr(projectId: string): Promise<DcrFlagDetail> {
  const rows = await db
    .select({ serialNo: panelSerials.serialNo })
    .from(panelSerials)
    .where(eq(panelSerials.projectId, projectId));

  const detail = summarise(await checkSerials(projectId, rows.map((r) => r.serialNo)));
  const problem = detail.missing.length > 0 || detail.elsewhere.length > 0;

  const [existing] = await db
    .select()
    .from(flags)
    .where(and(eq(flags.projectId, projectId), eq(flags.type, "DCR_SERIAL_MISMATCH")))
    .limit(1);

  if (problem) {
    if (!existing) {
      await db.insert(flags).values({
        projectId,
        type: "DCR_SERIAL_MISMATCH",
        status: "OPEN",
        detail: JSON.stringify(detail),
      });
    } else if (existing.status !== "WAIVED") {
      await db
        .update(flags)
        .set({
          detail: JSON.stringify(detail),
          ...(existing.status === "RESOLVED" ? { status: "OPEN" as const, resolvedAt: null, resolvedBy: null } : {}),
        })
        .where(eq(flags.id, existing.id));
    }
  } else if (existing && (existing.status === "OPEN" || existing.status === "IN_PROGRESS")) {
    await db
      .update(flags)
      .set({ status: "RESOLVED", resolvedAt: new Date(), detail: JSON.stringify(detail) })
      .where(eq(flags.id, existing.id));
  }

  const main = detail.certificates[0];
  if (main) {
    const [cert] = await db
      .select()
      .from(dcrCertificates)
      .where(eq(dcrCertificates.id, main.id))
      .limit(1);
    if (cert) {
      await db.insert(installations).values({ projectId }).onConflictDoNothing();
      await db
        .update(installations)
        .set({
          purchaseOrderNo: sql`coalesce(${installations.purchaseOrderNo}, ${cert.purchaseOrderNo})`,
          purchaseOrderDate: sql`coalesce(${installations.purchaseOrderDate}, ${cert.purchaseOrderDate}::date)`,
          cellManufacturer: sql`coalesce(${installations.cellManufacturer}, ${cert.cellManufacturer})`,
          cellGstInvoiceNo: sql`coalesce(${installations.cellGstInvoiceNo}, ${cert.invoiceRef})`,
        })
        .where(eq(installations.projectId, projectId));
    }
  }

  return detail;
}

/** Every project whose stage 3 lists any of these serials. */
export async function projectsUsingSerials(serials: string[]): Promise<string[]> {
  const wanted = [...new Set(serials.map(normaliseSerial))];
  if (wanted.length === 0) return [];
  const rows = await db
    .selectDistinct({ projectId: panelSerials.projectId })
    .from(panelSerials)
    .where(inArray(sql`upper(regexp_replace(${panelSerials.serialNo}, '\\s', '', 'g'))`, wanted));
  return rows.map((r) => r.projectId);
}

/** A project claims DCR modules unless stage 1 says otherwise — the same default stage 5 uses. */
export async function projectIsDcr(projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ isDcr: applicationDetails.isDcr })
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, projectId))
    .limit(1);
  return row?.isDcr ?? true;
}
