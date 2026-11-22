import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, exists, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dcrCertificates, dcrSerials, panelSerials, suppliers } from "@/lib/db/schema";
import { likePattern } from "@/lib/list/params";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { DcrTabs } from "@/components/dcr/dcr-tabs";

/**
 * Every DCR certificate received from a supplier, newest first.
 *
 * Search covers the certificate number, PO, invoice, model and any serial on
 * it, because the question that brings someone here is usually "which
 * certificate is this panel on?".
 */
export default async function DcrListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "document.read")) notFound();

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supplierParam = typeof sp.supplier === "string" ? Number(sp.supplier) : NaN;
  const supplierFilter = Number.isInteger(supplierParam) && supplierParam > 0 ? supplierParam : null;
  const term = q ? likePattern(q) : null;
  const serialTerm = q ? likePattern(q.replace(/\s+/g, "").toUpperCase()) : null;

  const where = and(
    supplierFilter ? eq(dcrCertificates.supplierId, supplierFilter) : undefined,
    term
      ? or(
          ilike(dcrCertificates.certificateNo, term),
          ilike(dcrCertificates.purchaseOrderNo, term),
          ilike(dcrCertificates.invoiceRef, term),
          ilike(dcrCertificates.modelNo, term),
          ilike(suppliers.name, term),
          exists(
            db
              .select({ one: sql`1` })
              .from(dcrSerials)
              .where(and(eq(dcrSerials.certificateId, dcrCertificates.id), ilike(dcrSerials.serialNo, serialTerm!))),
          ),
        )
      : undefined,
  );

  // A serial is "used" when any project's stage 3 lists it.
  const usedCount = sql<number>`(
    select count(distinct ${dcrSerials.serialNo})::int from ${dcrSerials}
    where ${dcrSerials.certificateId} = ${dcrCertificates.id}
      and exists (
        select 1 from ${panelSerials}
        where upper(regexp_replace(${panelSerials.serialNo}, '\\s', '', 'g')) = ${dcrSerials.serialNo}
      )
  )`;
  const serialCount = sql<number>`(select count(*)::int from ${dcrSerials} where ${dcrSerials.certificateId} = ${dcrCertificates.id})`;

  const [rows, supplierRows] = await Promise.all([
    db
      .select({
        id: dcrCertificates.id,
        certificateNo: dcrCertificates.certificateNo,
        revision: dcrCertificates.revision,
        certType: dcrCertificates.certType,
        certDate: dcrCertificates.certDate,
        supplier: suppliers.name,
        purchaseOrderNo: dcrCertificates.purchaseOrderNo,
        invoiceRef: dcrCertificates.invoiceRef,
        modelNo: dcrCertificates.modelNo,
        wattPeak: dcrCertificates.wattPeak,
        totalKw: dcrCertificates.totalKw,
        serials: serialCount,
        used: usedCount,
      })
      .from(dcrCertificates)
      .leftJoin(suppliers, eq(dcrCertificates.supplierId, suppliers.id))
      .where(where)
      .orderBy(desc(dcrCertificates.certDate), desc(dcrCertificates.id))
      .limit(200),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({ panels: acc.panels + r.serials, used: acc.used + r.used }),
    { panels: 0, used: 0 },
  );
  const filtered = Boolean(q || supplierFilter);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-7 pb-14 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">DCR certificates</h1>
          <p className="text-sm text-[var(--muted)]">
            {rows.length} certificate{rows.length === 1 ? "" : "s"}
            {filtered ? " matching" : ""} · {totals.panels} panels · {totals.used} installed ·{" "}
            {totals.panels - totals.used} in stock
          </p>
        </div>
        {can(actor, "document.upload") ? (
          <Link
            href="/dcr/new"
            className="flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            Upload certificate
          </Link>
        ) : null}
      </div>

      <DcrTabs active="certificates" />

      <form className="mb-4 flex flex-wrap gap-2.5" action="/dcr">
        <input
          name="q"
          defaultValue={q}
          placeholder="Certificate, PO, invoice, model or panel serial"
          className="h-10 min-w-60 flex-1 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13.5px] outline-none focus:border-[var(--orange)]"
        />
        <select
          name="supplier"
          defaultValue={supplierFilter ? String(supplierFilter) : ""}
          className="h-10 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13.5px]"
        >
          <option value="">Any supplier</option>
          {supplierRows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)]"
        >
          Search
        </button>
        {filtered ? (
          <Link href="/dcr" className="self-center text-[13px] font-semibold">
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center">
          <p className="mb-1 font-semibold">{filtered ? "Nothing matches." : "No DCR certificates yet."}</p>
          <p className="text-sm text-[var(--muted)]">
            {filtered
              ? "Try a shorter search, or clear the supplier."
              : "Upload the PDF a supplier sends with the panels; its serial numbers are then checked at installation."}
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {["Certificate", "Supplier", "Date", "PO / Invoice", "Module", "Panels", "Installed"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--line)] px-5 py-2.5 text-left text-[12px] font-semibold text-[var(--muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--line-soft)]">
                    <td className="px-5 py-3.5 align-middle">
                      <Link href={`/dcr/${r.id}`} className="ref text-[13px] font-medium no-underline">
                        {r.certificateNo}
                      </Link>
                      <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                        {r.certType ?? "—"} · Rev {r.revision}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[13.5px] font-semibold">{r.supplier ?? "—"}</td>
                    <td className="ref px-5 py-3.5 align-middle text-[12.5px] whitespace-nowrap text-[var(--muted)]">
                      {r.certDate ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[12.5px]">
                      <div className="ref">{r.purchaseOrderNo ?? "—"}</div>
                      <div className="ref mt-0.5 text-[var(--muted)]">{r.invoiceRef ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[12.5px]">
                      <div className="ref">{r.modelNo ?? "—"}</div>
                      <div className="mt-0.5 text-[var(--muted)]">{r.wattPeak ? `${r.wattPeak} Wp` : ""}</div>
                    </td>
                    <td className="ref px-5 py-3.5 align-middle text-[13px] whitespace-nowrap">
                      {r.serials} · {r.totalKw ? `${Number(r.totalKw)} kW` : "—"}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          r.used >= r.serials && r.serials > 0
                            ? "bg-[var(--chip-soft)] text-[var(--chip-text)]"
                            : r.used > 0
                              ? "bg-[var(--navy-soft)] text-[var(--navy-text)]"
                              : "bg-[var(--green-soft)] text-[var(--green-text)]"
                        }`}
                      >
                        {r.used} of {r.serials}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
