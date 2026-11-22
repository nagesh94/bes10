import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, FileText, Landmark, Paperclip, Scale } from "lucide-react";
import { Panel } from "@/components/dashboard/fleet";
import { FinanceFilters } from "@/components/finance/finance-filters";
import { ListPager } from "@/components/shell/list-controls";
import { loadGstBills } from "@/lib/gst/bills";
import { DOC_TYPE_LABEL, type DocType } from "@/lib/gst/fields";
import { compact, inRange, inr, paginate, readPaging } from "@/lib/finance/ledger";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { fileHref } from "@/lib/storage/file-url";

/**
 * GST bills: what was bought and sold, and the tax on each.
 *
 * The figure that matters for a purchase is the GST paid on it — input tax
 * credit, claimable against the GST owed on sales. A credit note counts
 * against its party, so every sum here is already net of them.
 */

export const metadata: Metadata = { title: "GST bills" };

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => ((Array.isArray(raw[k]) ? raw[k]![0] : raw[k]) as string | undefined)?.trim() ?? "";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00`));
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function GstBillsPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canWrite = can(actor, "money.write");

  const raw = await searchParams;
  const q = one(raw, "q").slice(0, 80).toLowerCase();
  const dir = ["purchase", "sales"].includes(one(raw, "dir")) ? one(raw, "dir") : "";
  const supplier = one(raw, "supplier");
  const doc = one(raw, "doc");
  const range = {
    from: ISO.test(one(raw, "from")) ? one(raw, "from") : "",
    to: ISO.test(one(raw, "to")) ? one(raw, "to") : "",
  };
  const paging = readPaging(raw);

  const all = await loadGstBills();

  const supplierOptions = [
    ...new Map(all.filter((b) => b.supplierId).map((b) => [String(b.supplierId), b.party])).entries(),
  ]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));

  const rows = all.filter((b) => {
    if (!inRange(b.invoiceDate, range)) return false;
    if (dir && b.direction !== dir) return false;
    if (supplier && String(b.supplierId) !== supplier) return false;
    if (doc && b.docType !== doc) return false;
    if (q && !`${b.party} ${b.partyGstin ?? ""} ${b.invoiceNo} ${b.projectCode ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const purchases = rows.filter((b) => b.direction === "purchase");
  const sales = rows.filter((b) => b.direction === "sales");
  const bought = purchases.reduce((s, b) => s + b.taxableValue, 0);
  const inputTax = purchases.filter((b) => b.itcEligible).reduce((s, b) => s + b.tax, 0);
  const blocked = purchases.filter((b) => !b.itcEligible).reduce((s, b) => s + b.tax, 0);
  const outputTax = sales.reduce((s, b) => s + b.tax, 0);
  const net = outputTax - inputTax;

  // Suppliers by what was bought from them.
  const bySupplier = new Map<string, { id: number | null; amount: number; tax: number; count: number }>();
  for (const b of purchases) {
    const t = bySupplier.get(b.party) ?? { id: b.supplierId, amount: 0, tax: 0, count: 0 };
    t.amount += b.total;
    t.tax += b.tax;
    t.count += 1;
    bySupplier.set(b.party, t);
  }
  const supplierList = [...bySupplier.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);
  const topAmount = supplierList[0]?.[1].amount ?? 0;

  // Tax heads, for the GSTR-3B style split.
  const heads = (list: typeof rows) => ({
    cgst: list.reduce((s, b) => s + b.cgst, 0),
    sgst: list.reduce((s, b) => s + b.sgst, 0),
    igst: list.reduce((s, b) => s + b.igst, 0),
    cess: list.reduce((s, b) => s + b.cess, 0),
  });
  const inHeads = heads(purchases.filter((b) => b.itcEligible));
  const outHeads = heads(sales);

  const pageOf = paginate(rows, paging);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-5 pb-14 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">GST bills</h1>
          <p className="text-sm text-[var(--muted)]">
            Supplier bills and our own invoices, read from the PDF — with the GST on each.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/finance/gst/new"
            className="flex h-10 items-center rounded-lg bg-[var(--orange)] px-4 text-[13.5px] font-bold text-[var(--orange-ink)] no-underline"
          >
            + Upload bill
          </Link>
        ) : null}
      </div>

      <FinanceFilters
        placeholder="Search supplier, GSTIN, invoice no., project…"
        per={pageOf.per}
        filters={[
          {
            name: "dir",
            anyLabel: "Purchases and sales",
            options: [
              { value: "purchase", label: "Purchases" },
              { value: "sales", label: "Sales" },
            ],
          },
          { name: "supplier", anyLabel: "Any supplier", options: supplierOptions },
          {
            name: "doc",
            anyLabel: "Any document",
            options: Object.entries(DOC_TYPE_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
      />

      <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {[
          { Icon: FileText, label: "Bills", value: String(rows.length), hint: `${purchases.length} purchases · ${sales.length} sales` },
          { Icon: ArrowDownLeft, label: "Bought (before tax)", value: `₹${compact(bought)}`, hint: `${bySupplier.size} suppliers` },
          {
            Icon: Landmark,
            label: "Input GST (ITC)",
            value: `₹${compact(inputTax)}`,
            hint: blocked ? `+ ₹${compact(blocked)} not claimable` : "GST paid, claimable",
          },
          { Icon: ArrowUpRight, label: "Output GST", value: `₹${compact(outputTax)}`, hint: "on our sales invoices" },
          {
            Icon: Scale,
            label: net >= 0 ? "Net GST payable" : "ITC carried forward",
            value: `₹${compact(Math.abs(net))}`,
            hint: "output GST − input GST",
          },
        ].map((t) => (
          <div key={t.label} className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4.5 py-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--navy-text)]">
                <t.Icon size={15} strokeWidth={2.2} aria-hidden />
              </span>
              {t.label}
            </div>
            <div className="num mt-2.5 text-[24px] leading-tight font-extrabold">{t.value}</div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{t.hint}</div>
          </div>
        ))}
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="By supplier" note="bill totals in this range · click to filter">
          {supplierList.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[var(--muted)]">No purchase bill in this range.</p>
          ) : (
            <ul className="py-1.5">
              {supplierList.map(([name, t]) => (
                <li key={name}>
                  <Link
                    href={t.id ? `/finance/gst?supplier=${t.id}${range.from ? `&from=${range.from}` : ""}${range.to ? `&to=${range.to}` : ""}` : "#"}
                    className="block px-5 py-3 text-[var(--ink)] no-underline hover:bg-[var(--surface-2)]"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{name}</span>
                      <span className="num shrink-0 text-[12.5px] text-[var(--muted)]">GST ₹{compact(t.tax)}</span>
                      <span className="num shrink-0 text-[13.5px] font-bold">₹{compact(t.amount)}</span>
                      <span className="num w-10 shrink-0 text-right text-[12.5px] text-[var(--muted)]">{t.count}×</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--data-track)]">
                      <div
                        className="h-full rounded-full bg-[var(--data-1)]"
                        style={{ width: `${Math.max((topAmount ? t.amount / topAmount : 0) * 100, 1.5)}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Tax by head" note="claimable input against output">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line-soft)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                <th className="px-5 py-2.5" />
                <th className="px-3 py-2.5 text-right">Input</th>
                <th className="px-3 py-2.5 text-right">Output</th>
                <th className="px-5 py-2.5 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {(["igst", "cgst", "sgst", "cess"] as const).map((h) => (
                <tr key={h} className="border-b border-[var(--line-soft)] last:border-b-0">
                  <td className="px-5 py-2.5 text-[13px] font-semibold uppercase">{h === "sgst" ? "SGST/UTGST" : h}</td>
                  <td className="num px-3 py-2.5 text-right text-[13px]">{inr(inHeads[h])}</td>
                  <td className="num px-3 py-2.5 text-right text-[13px]">{inr(outHeads[h])}</td>
                  <td className="num px-5 py-2.5 text-right text-[13px] font-bold">{inr(outHeads[h] - inHeads[h])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[var(--line-soft)] px-5 py-3 text-[12px] text-[var(--muted)]">
            A guide, not a return: the portal&apos;s GSTR-2B decides which input credit is actually available.
          </p>
        </Panel>
      </div>

      <Panel title="All bills" note={`${rows.length} match`} className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">
            {all.length === 0 ? (
              <>
                No GST bill yet.{" "}
                {canWrite ? (
                  <Link href="/finance/gst/new" className="font-semibold">
                    Upload the first one
                  </Link>
                ) : null}
              </>
            ) : (
              "Nothing matches these filters."
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5">Party</th>
                  <th className="px-3 py-2.5">Site</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th>
                  <th className="px-3 py-2.5 text-right">GST</th>
                  <th className="px-5 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {pageOf.items.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--line-soft)] align-top last:border-b-0 hover:bg-[var(--surface-2)]">
                    <td className="px-5 py-3 text-[13px] whitespace-nowrap">{fmtDay(b.invoiceDate)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/finance/gst/${b.id}`} className="ref text-[13px] font-bold text-[var(--navy-text)] no-underline hover:underline">
                        {b.invoiceNo}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Tag tone={b.direction === "sales" ? "green" : "plain"}>{b.direction === "sales" ? "Sale" : "Purchase"}</Tag>
                        {b.docType !== "tax_invoice" ? <Tag tone="amber">{DOC_TYPE_LABEL[b.docType as DocType] ?? b.docType}</Tag> : null}
                        {b.reverseCharge ? <Tag tone="amber">RCM</Tag> : null}
                        {b.direction === "purchase" && !b.itcEligible ? <Tag tone="plain">No ITC</Tag> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-64 truncate text-[13.5px] font-semibold">{b.party}</div>
                      {b.partyGstin ? <div className="ref text-[11.5px] text-[var(--muted)]">{b.partyGstin}</div> : null}
                      {b.hasFile ? (
                        <a
                          href={fileHref("gst", String(b.id))}
                          target="_blank"
                          rel="noopener"
                          title={b.fileName ?? undefined}
                          className="mt-1 inline-flex max-w-64 items-center gap-1 text-[12px] font-semibold text-[var(--navy-text)] no-underline hover:underline"
                        >
                          <Paperclip size={12} className="shrink-0" aria-hidden />
                          <span className="truncate">{b.fileName ?? "Bill"}</span>
                        </a>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {b.projectId ? (
                        <Link href={`/projects/${b.projectId}/payments`} className="ref text-[12px] font-bold text-[var(--navy-text)] no-underline hover:underline">
                          {b.projectCode}
                        </Link>
                      ) : (
                        <span className="text-[12px] text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right text-[13px]">{rupees(b.taxableValue)}</td>
                    <td className="num px-3 py-3 text-right text-[13px]">
                      {rupees(b.tax)}
                      <div className="text-[11px] text-[var(--muted)]">{b.igst ? "IGST" : b.cgst || b.sgst ? "CGST+SGST" : "no tax"}</div>
                    </td>
                    <td className="num px-5 py-3 text-right text-[14px] font-bold">{rupees(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[var(--line-soft)] px-5 pb-3.5">
          <ListPager total={rows.length} page={pageOf.page} per={pageOf.per} noun="bills" />
        </div>
      </Panel>
    </main>
  );
}

function Tag({ tone, children }: { tone: "plain" | "green" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-[var(--green-soft)] text-[var(--green-text)]"
      : tone === "amber"
        ? "bg-[var(--amber-surface)] text-[var(--amber-text)]"
        : "bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${cls}`}>{children}</span>;
}
