import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, dcrCertificates, dcrSerials, panelSerials, projects, suppliers, user } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { fileHref } from "@/lib/storage/file-url";
import { DeleteDcrButton } from "@/components/dcr/delete-dcr";
import { ChainOfCustody } from "@/components/dcr/chain-of-custody";

export default async function DcrDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "document.read")) notFound();

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id)) notFound();
  const sp = await searchParams;
  const justSaved = typeof sp.saved === "string" ? Number(sp.saved) : null;

  const [row] = await db
    .select({ cert: dcrCertificates, supplier: suppliers, uploader: user.name })
    .from(dcrCertificates)
    .leftJoin(suppliers, eq(dcrCertificates.supplierId, suppliers.id))
    .leftJoin(user, eq(dcrCertificates.uploadedBy, user.id))
    .where(eq(dcrCertificates.id, id))
    .limit(1);
  if (!row) notFound();
  const { cert, supplier } = row;

  const serials = await db
    .select()
    .from(dcrSerials)
    .where(eq(dcrSerials.certificateId, id))
    .orderBy(asc(dcrSerials.sortOrder));

  const normalised = sql<string>`upper(regexp_replace(${panelSerials.serialNo}, '\\s', '', 'g'))`;
  const usage = serials.length
    ? await db
        .select({
          serial: normalised,
          projectId: projects.id,
          code: projects.code,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(panelSerials)
        .innerJoin(projects, eq(panelSerials.projectId, projects.id))
        .leftJoin(contacts, eq(projects.contactId, contacts.id))
        .where(inArray(normalised, serials.map((s) => s.serialNo)))
    : [];

  const usedBy = (serial: string) => usage.filter((u) => u.serial === serial);
  const usedCount = serials.filter((s) => usedBy(s.serialNo).length > 0).length;
  const extracted = (cert.extracted ?? null) as { conflicts?: unknown[]; unverified?: string[] } | null;

  const facts: [string, React.ReactNode][] = [
    ["Certificate date", cert.certDate ?? "—"],
    ["Type · Revision", `${cert.certType ?? "—"} · ${cert.revision}`],
    ["Issued to", [cert.issuedToName, cert.issuedToGstin].filter(Boolean).join(" · ") || "—"],
    ["Purchase order", [cert.purchaseOrderNo, cert.purchaseOrderDate].filter(Boolean).join(" · ") || "—"],
    ["Invoice / E-way", [cert.invoiceRef, cert.invoiceDate].filter(Boolean).join(" · ") || "—"],
    ["Cell manufacturer", <Maker key="c" name={cert.cellManufacturer} address={cert.cellManufacturerAddress} />],
    ["Module manufacturer", <Maker key="m" name={cert.moduleManufacturer} address={cert.moduleManufacturerAddress} />],
    ["Model", [cert.modelNo, cert.moduleDescription].filter(Boolean).join(" — ") || "—"],
    [
      "Rating",
      [
        cert.wattPeak ? `${cert.wattPeak} Wp` : null,
        cert.efficiency ? `${Number(cert.efficiency)}% efficiency` : null,
        cert.technology,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
    ["Cell model", cert.cellModel ?? "—"],
    ["Quantity", `${cert.quantity ?? serials.length} panels · ${cert.totalKw ? Number(cert.totalKw) : "—"} kW`],
  ];

  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-7 pb-14 sm:px-6">
      <Link href="/dcr" className="mb-2 inline-block text-[13px] font-semibold no-underline">
        ← DCR certificates
      </Link>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="ref mb-1 text-[24px] font-bold tracking-[-0.01em]">{cert.certificateNo}</h1>
          <p className="text-sm text-[var(--muted)]">
            {supplier?.name ?? "No supplier"} · {usedCount} of {serials.length} installed · uploaded{" "}
            {cert.uploadedAt.toISOString().slice(0, 10)}
            {row.uploader ? ` by ${row.uploader}` : ""}
          </p>
        </div>
        {cert.s3Key ? (
          <a
            href={fileHref("dcr", String(cert.id))}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)] no-underline"
          >
            Open PDF
          </a>
        ) : null}
        <a
          href="https://solardcrportal.nise.res.in/verifydcr"
          target="_blank"
          rel="noreferrer"
          className="flex h-10 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)] no-underline"
        >
          Verify on NISE
        </a>
        {can(actor, "document.delete") ? (
          <DeleteDcrButton id={cert.id} certificateNo={cert.certificateNo} used={usedCount} />
        ) : null}
      </div>

      {justSaved !== null ? (
        <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-3 text-[13px] text-[var(--green-text)]">
          Saved.{" "}
          {justSaved > 0
            ? `${justSaved} project${justSaved === 1 ? "" : "s"} already listing these serials ${justSaved === 1 ? "was" : "were"} re-checked.`
            : "Its serials will be matched as panels are recorded at installation."}
        </div>
      ) : null}
      {extracted?.conflicts?.length || extracted?.unverified?.length ? (
        <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[12.5px] text-[var(--muted)]">
          When read, {extracted.conflicts?.length ?? 0} field(s) differed between the parser and Gemini and{" "}
          {extracted.unverified?.length ?? 0} were filled by Gemini alone. The values shown were confirmed at review.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4.5">
        <section className="min-w-80 flex-[1_1_480px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <h2 className="border-b border-[var(--line)] px-5 py-3.5 text-[15px] font-bold">Details</h2>
          <dl className="divide-y divide-[var(--line-soft)]">
            {facts.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-4 gap-y-0.5 px-5 py-2.5">
                <dt className="w-40 shrink-0 text-[12.5px] font-semibold text-[var(--muted)]">{k}</dt>
                <dd className="min-w-0 flex-1 text-[13.5px]">{v}</dd>
              </div>
            ))}
          </dl>
          {cert.notes ? <p className="border-t border-[var(--line)] px-5 py-3 text-[13px]">{cert.notes}</p> : null}
        </section>

        <section className="min-w-72 flex-[1_1_340px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <h2 className="border-b border-[var(--line)] px-5 py-3.5 text-[15px] font-bold">Supplier</h2>
          {supplier ? (
            <div className="px-5 py-3.5 text-[13.5px]">
              <div className="font-semibold">{supplier.name}</div>
              {supplier.gstin ? <div className="ref mt-0.5 text-[12.5px]">GSTIN {supplier.gstin}</div> : null}
              {supplier.pan ? <div className="ref text-[12.5px]">PAN {supplier.pan}</div> : null}
              {supplier.address ? (
                <div className="mt-1.5 text-[12.5px] text-[var(--muted)]">
                  {[supplier.address, supplier.state, supplier.pincode].filter(Boolean).join(", ")}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="px-5 py-3.5 text-[13px] text-[var(--muted)]">—</p>
          )}
          {cert.chain?.length ? (
            <ChainOfCustody chain={cert.chain} className="border-t border-[var(--line)] px-5 py-3.5" />
          ) : null}
        </section>
      </div>

      <section className="mt-4.5 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        <h2 className="border-b border-[var(--line)] px-5 py-3.5 text-[15px] font-bold">
          Panel serials ({serials.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-2)]">
                {["#", "Serial", "Wp", "Installed on"].map((h) => (
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
              {serials.map((s, i) => {
                const on = usedBy(s.serialNo);
                return (
                  <tr key={s.id} className="border-b border-[var(--line-soft)]">
                    <td className="ref px-5 py-2.5 text-[12px] text-[var(--muted)]">{i + 1}</td>
                    <td className="ref px-5 py-2.5 text-[13px]">{s.serialNo}</td>
                    <td className="ref px-5 py-2.5 text-[12.5px]">{s.wattPeak ?? "—"}</td>
                    <td className="px-5 py-2.5 text-[13px]">
                      {on.length === 0 ? (
                        <span className="rounded-full bg-[var(--green-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--green-text)]">
                          In stock
                        </span>
                      ) : (
                        on.map((u) => (
                          <Link
                            key={u.projectId}
                            href={`/projects/${u.projectId}/stage-3`}
                            className={`mr-2 no-underline ${on.length > 1 ? "text-[var(--red-text)]" : ""}`}
                          >
                            <span className="ref">{u.code}</span>
                            {u.firstName ? ` · ${u.firstName} ${u.lastName ?? ""}` : ""}
                          </Link>
                        ))
                      )}
                      {on.length > 1 ? (
                        <span className="text-[11.5px] font-semibold text-[var(--red-text)]">on two projects</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Maker({ name, address }: { name: string | null; address: string | null }) {
  if (!name) return <>—</>;
  return (
    <>
      <span className="font-semibold">{name}</span>
      {address ? <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{address}</span> : null}
    </>
  );
}
