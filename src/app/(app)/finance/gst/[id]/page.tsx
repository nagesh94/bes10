import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteGstButton } from "@/components/gst/delete-gst";
import { loadGstBill } from "@/lib/gst/bills";
import { DOC_TYPE_LABEL, ITEM_KIND_LABEL, STATE_CODES, type DocType, type ItemKind } from "@/lib/gst/fields";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { fileHref } from "@/lib/storage/file-url";

export const metadata: Metadata = { title: "GST bill" };

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (iso: string | null) => (iso ? DAY.format(new Date(`${iso}T00:00:00`)) : "—");
const rupees = (v: string | number | null) =>
  v === null ? "—" : `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: string | null) => (v === null ? "" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 }));

export default async function GstBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id)) notFound();
  const justSaved = (await searchParams).saved === "1";

  const found = await loadGstBill(id);
  if (!found) notFound();
  const { bill, supplier, items } = found;

  const purchase = bill.direction === "purchase";
  const tax = Number(bill.cgst) + Number(bill.sgst) + Number(bill.igst) + Number(bill.cess);
  const extracted = (bill.extracted ?? null) as { conflicts?: unknown[]; unverified?: string[] } | null;

  const facts: [string, React.ReactNode][] = [
    ["Document", `${DOC_TYPE_LABEL[bill.docType as DocType] ?? bill.docType} · ${purchase ? "purchase" : "sale"}`],
    ["Invoice", `${bill.invoiceNo} · ${fmtDay(bill.invoiceDate)}`],
    ["Place of supply", bill.placeOfSupply ? `${bill.placeOfSupply} · ${STATE_CODES[bill.placeOfSupply] ?? ""}` : "—"],
    ["Reverse charge", bill.reverseCharge ? "Yes — we pay this GST to the government" : "No"],
    [purchase ? "Billed to (ours)" : "Issued from (ours)", <span key="o" className="ref">{bill.ourGstin ?? "—"}</span>],
    ...(bill.refInvoiceNo
      ? ([["Against invoice", `${bill.refInvoiceNo} · ${fmtDay(bill.refInvoiceDate)}`]] as [string, React.ReactNode][])
      : []),
    ["IRN", bill.irn ? <span key="i" className="ref text-[12px] break-all">{bill.irn}</span> : "—"],
    ["Ack", bill.ackNo ? `${bill.ackNo} · ${fmtDay(bill.ackDate)}` : "—"],
    ["E-way bill", bill.ewayBillNo ?? "—"],
    ["Buyer's order", bill.buyerOrderNo ?? "—"],
    [
      "Project",
      bill.projectId ? (
        <Link key="p" href={`/projects/${bill.projectId}/payments`} className="no-underline">
          <span className="ref">{found.projectCode}</span>
          {found.firstName ? ` · ${found.firstName} ${found.lastName ?? ""}` : ""}
        </Link>
      ) : (
        "Stock or office"
      ),
    ],
    ["Input tax credit", purchase ? (bill.itcEligible ? "Claimable" : "Not claimable") : "— (sale)"],
  ];

  const totals: [string, string | null, boolean?][] = [
    ["Taxable value", bill.taxableValue],
    ["CGST", Number(bill.cgst) ? bill.cgst : null],
    ["SGST / UTGST", Number(bill.sgst) ? bill.sgst : null],
    ["IGST", Number(bill.igst) ? bill.igst : null],
    ["Cess", Number(bill.cess) ? bill.cess : null],
    ["TCS", Number(bill.tcs) ? bill.tcs : null],
    ["Round off", Number(bill.roundOff) ? bill.roundOff : null],
    ["Total", bill.total, true],
  ];

  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-6 pb-14 sm:px-6">
      <Link href="/finance/gst" className="mb-2 inline-block text-[13px] font-semibold no-underline">
        ← GST bills
      </Link>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[24px] font-bold tracking-[-0.01em]">
            {bill.partyName} · <span className="ref">{bill.invoiceNo}</span>
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {fmtDay(bill.invoiceDate)} · {rupees(bill.total)} · GST {rupees(tax)} · uploaded{" "}
            {bill.uploadedAt.toISOString().slice(0, 10)}
            {found.uploader ? ` by ${found.uploader}` : ""}
          </p>
        </div>
        {bill.s3Key ? (
          <a
            href={fileHref("gst", String(bill.id))}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)] no-underline"
          >
            Open bill
          </a>
        ) : null}
        {can(actor, "money.write") ? <DeleteGstButton id={bill.id} invoiceNo={bill.invoiceNo} /> : null}
      </div>

      {justSaved ? (
        <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-3 text-[13px] text-[var(--green-text)]">
          Saved.
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
          {bill.notes ? <p className="border-t border-[var(--line)] px-5 py-3 text-[13px]">{bill.notes}</p> : null}
        </section>

        <div className="flex min-w-72 flex-[1_1_340px] flex-col gap-4.5">
          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            <h2 className="border-b border-[var(--line)] px-5 py-3.5 text-[15px] font-bold">{purchase ? "Supplier" : "Customer"}</h2>
            <div className="px-5 py-3.5 text-[13.5px]">
              <div className="font-semibold">{supplier?.name ?? bill.partyName}</div>
              {(supplier?.gstin ?? bill.partyGstin) ? (
                <div className="ref mt-0.5 text-[12.5px]">GSTIN {supplier?.gstin ?? bill.partyGstin}</div>
              ) : (
                <div className="mt-0.5 text-[12.5px] text-[var(--muted)]">Unregistered</div>
              )}
              {supplier?.address ? (
                <div className="mt-1.5 text-[12.5px] text-[var(--muted)]">
                  {[supplier.address, supplier.state, supplier.pincode].filter(Boolean).join(", ")}
                </div>
              ) : null}
              {supplier?.id ? (
                <Link href={`/finance/gst?supplier=${supplier.id}`} className="mt-2 inline-block text-[12.5px] font-semibold no-underline">
                  All bills from this supplier →
                </Link>
              ) : null}
            </div>
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            <h2 className="border-b border-[var(--line)] px-5 py-3.5 text-[15px] font-bold">Totals</h2>
            <dl>
              {totals
                .filter(([, v]) => v !== null)
                .map(([k, v, strong]) => (
                  <div
                    key={k}
                    className={`flex justify-between px-5 py-2 text-[13.5px] ${strong ? "border-t border-[var(--line)] font-bold" : ""}`}
                  >
                    <dt className={strong ? "" : "text-[var(--muted)]"}>{k}</dt>
                    <dd className="num">{rupees(v)}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>
      </div>

      <section className="mt-4.5 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        <h2 className="border-b border-[var(--line)] px-5 py-3.5 text-[15px] font-bold">Lines ({items.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="bg-[var(--surface-2)] text-[12px] font-semibold text-[var(--muted)]">
                <th className="border-b border-[var(--line)] px-5 py-2.5">#</th>
                <th className="border-b border-[var(--line)] px-3 py-2.5">Description</th>
                <th className="border-b border-[var(--line)] px-3 py-2.5">HSN/SAC</th>
                <th className="border-b border-[var(--line)] px-3 py-2.5 text-right">Qty</th>
                <th className="border-b border-[var(--line)] px-3 py-2.5 text-right">Rate</th>
                <th className="border-b border-[var(--line)] px-3 py-2.5 text-right">Taxable</th>
                <th className="border-b border-[var(--line)] px-3 py-2.5 text-right">GST</th>
                <th className="border-b border-[var(--line)] px-5 py-2.5 text-right">Tax</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id} className="border-b border-[var(--line-soft)] align-top">
                  <td className="ref px-5 py-2.5 text-[12px] text-[var(--muted)]">{i + 1}</td>
                  <td className="px-3 py-2.5 text-[13px]">
                    {it.description}
                    {it.kind !== "goods" ? (
                      <span className="ml-2 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--muted)]">
                        {ITEM_KIND_LABEL[it.kind as ItemKind] ?? it.kind}
                      </span>
                    ) : null}
                  </td>
                  <td className="ref px-3 py-2.5 text-[12.5px]">{it.hsnSac ?? "—"}</td>
                  <td className="num px-3 py-2.5 text-right text-[13px]">
                    {qty(it.quantity)} {it.unit ?? ""}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[13px]">{it.rate === null ? "—" : rupees(it.rate)}</td>
                  <td className="num px-3 py-2.5 text-right text-[13px]">{rupees(it.taxableValue)}</td>
                  <td className="num px-3 py-2.5 text-right text-[13px]">{it.gstRate === null ? "—" : `${Number(it.gstRate)}%`}</td>
                  <td className="num px-5 py-2.5 text-right text-[13px]">
                    {rupees(Number(it.cgst) + Number(it.sgst) + Number(it.igst) + Number(it.cess))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
