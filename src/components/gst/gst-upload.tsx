"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { extractGstBill, saveGstBill, type ExtractGstResult } from "@/app/actions/gst";
import type { SupplierOption } from "@/app/actions/dcr";
import { ReadingProgress } from "@/components/dcr/reading-progress";
import { SupplierForm, inputCls, labelCls } from "@/components/dcr/supplier-form";
import { Combobox } from "@/components/finance/combobox";
import { billTax, checkBill, itemsTaxable } from "@/lib/gst/check";
import {
  DOC_TYPES,
  DOC_TYPE_LABEL,
  EMPTY_ITEM,
  ITEM_KINDS,
  ITEM_KIND_LABEL,
  STATE_CODES,
  amt,
  money,
  type Direction,
  type GstBillFields,
  type GstItemFields,
  type GstScalarKey,
} from "@/lib/gst/fields";

type Extracted = Extract<ExtractGstResult, { ok: true }>;

const METHOD_LABEL: Record<string, string> = {
  parser: "Read by the text parser — every total checks out",
  "parser+llm": "Read by the text parser, gaps filled by Gemini",
  "llm-text": "Read by Gemini from the PDF's text",
  "llm-file": "Scan or photo — read by Gemini from the image",
};

const LABEL: Partial<Record<GstScalarKey, string>> = {
  invoiceNo: "Invoice no.",
  invoiceDate: "Invoice date",
  sellerName: "Seller name",
  sellerGstin: "Seller GSTIN",
  buyerName: "Buyer name",
  buyerGstin: "Buyer GSTIN",
  placeOfSupply: "Place of supply",
  irn: "IRN",
  ackNo: "Ack no.",
  ackDate: "Ack date",
  ewayBillNo: "E-way bill no.",
  buyerOrderNo: "Buyer's order no.",
  refInvoiceNo: "Original invoice no.",
  refInvoiceDate: "Original invoice date",
  taxableValue: "Taxable value",
  cgst: "CGST",
  sgst: "SGST / UTGST",
  igst: "IGST",
  cess: "Cess",
  tcs: "TCS",
  roundOff: "Round off",
  total: "Total",
};

const WORDS = {
  reading: "Reading the bill…",
  read: "Bill read",
  parse: "Reading the items and the tax",
  llm: "Asking Gemini where the text was unclear",
  match: "Adding up and matching the supplier",
};

const smallInput =
  "h-9 w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";

/**
 * Upload → read → review → save, for any GST bill.
 *
 * The file never leaves the browser until save: reading sends it once, and
 * saving sends it again with the reviewed fields, so an abandoned review
 * stores nothing. The bill's arithmetic is re-checked on every keystroke,
 * so a corrected number shows straight away whether the bill now adds up.
 */
export function GstUpload({
  suppliers: initialSuppliers,
  projects,
}: {
  suppliers: SupplierOption[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"pick" | "reading" | "review" | "saving">("pick");
  const [readDone, setReadDone] = useState(false);
  const [result, setResult] = useState<Extracted | null>(null);
  const [fields, setFields] = useState<GstBillFields | null>(null);
  const [direction, setDirection] = useState<Direction>("purchase");
  const [supplierId, setSupplierId] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [itcEligible, setItcEligible] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function read(f: File) {
    setFile(f);
    setError(null);
    setPhase("reading");
    const fd = new FormData();
    fd.set("file", f);
    let r: ExtractGstResult;
    try {
      r = await extractGstBill(fd);
    } catch (err) {
      r = { ok: false, error: (err as Error).message || "Reading failed." };
    }
    if (!r.ok) {
      setError(r.error);
      setPhase("pick");
      return;
    }
    setResult(r);
    setFields(r.fields);
    setDirection(r.direction);
    setSupplierId(r.supplierId ? String(r.supplierId) : "");
    setAddingSupplier(r.direction === "purchase" && !r.supplierId && Boolean(r.fields.sellerName));
    setItcEligible(r.fields.docType !== "bill_of_supply");
    setReadDone(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setReadDone(false);
    setPhase("review");
  }

  const set = (key: GstScalarKey, value: string) => setFields((f) => (f ? { ...f, [key]: value } : f));
  const setItem = (index: number, key: keyof GstItemFields, value: string) =>
    setFields((f) => (f ? { ...f, items: f.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)) } : f));

  const liveIssues = useMemo(
    () => (fields && result ? checkBill(fields, { ourGstins: result.ourGstins, direction }) : []),
    [fields, result, direction],
  );

  async function save() {
    if (!file || !fields || !result) return;
    setPhase("saving");
    setError(null);
    setFieldErrors({});
    const { items, ...scalars } = fields;
    const data = {
      ...scalars,
      direction,
      supplierId: direction === "purchase" && supplierId ? Number(supplierId) : null,
      projectId,
      itcEligible,
      notes,
      items: items.map((i) => ({ ...i, kind: i.kind || "goods" })),
      extraction: {
        method: result.method,
        conflicts: result.conflicts,
        unverified: result.unverified,
        original: result.fields,
      },
    };
    const fd = new FormData();
    fd.set("file", file);
    fd.set("data", JSON.stringify(data));
    const r = await saveGstBill(fd);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      setPhase("review");
      return;
    }
    router.push(`/finance/gst/${r.id}?saved=1`);
  }

  if (phase === "reading" && file) {
    return <ReadingProgress fileName={file.name} sizeBytes={file.size} done={readDone} words={WORDS} />;
  }

  if (phase === "pick" || phase === "reading") {
    return (
      <div className="dcr-rise">
        <label
          className="group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center transition-colors duration-200 hover:border-[var(--orange)] hover:bg-[var(--orange-soft)]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void read(f);
          }}
        >
          <input
            type="file"
            accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
              e.target.value = "";
            }}
          />
          <span
            aria-hidden
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--orange-soft)] text-xl text-[var(--orange-text)] transition-transform duration-200 group-hover:-translate-y-1"
          >
            ↑
          </span>
          <span className="mb-1 text-base font-bold">Choose or drop the GST bill</span>
          <span className="text-[13px] text-[var(--muted)]">
            A PDF from the supplier, or a photo of a paper bill. Up to 12 MB.
          </span>
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--red-text)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!fields || !result) return null;

  const conflictFor = (key: GstScalarKey) => result.conflicts.find((c) => c.key === key);
  const isUnverified = (key: GstScalarKey) => result.unverified.includes(key);
  const purchase = direction === "purchase";
  const lines = itemsTaxable(fields);
  const tax = billTax(fields);
  const isNote = fields.docType === "credit_note" || fields.docType === "debit_note";

  // A render function, not a component: a component declared here would be
  // a new type on every render and its input would lose focus on each key.
  const field = ({ k, type, wide, ref, hint }: { k: GstScalarKey; type?: string; wide?: boolean; ref?: boolean; hint?: string }) => {
    const conflict = conflictFor(k);
    const warn = Boolean(conflict) || isUnverified(k) || Boolean(fieldErrors[k]);
    return (
      <label key={k} className={wide ? "sm:col-span-2" : ""}>
        <span className={labelCls}>{LABEL[k] ?? k}</span>
        <input
          type={type === "date" ? "date" : "text"}
          inputMode={type === "decimal" ? "decimal" : undefined}
          value={fields[k]}
          onChange={(e) => set(k, e.target.value)}
          className={`${inputCls} ${ref ? "ref" : ""} ${warn ? "border-[var(--amber-text)] bg-[var(--amber-surface)]" : ""}`}
        />
        {conflict ? (
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--amber-text)]">
            Gemini read: <span className="ref font-semibold">{conflict.llm}</span>
            <button
              type="button"
              onClick={() => set(k, conflict.llm)}
              className="cursor-pointer rounded border border-[var(--amber-border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-bold"
            >
              Use this
            </button>
          </span>
        ) : null}
        {isUnverified(k) ? (
          <span className="mt-1 block text-[11.5px] text-[var(--amber-text)]">Filled by Gemini, not found in the text.</span>
        ) : null}
        {fieldErrors[k] ? <span className="mt-1 block text-[11.5px] text-[var(--red-text)]">{fieldErrors[k]![0]}</span> : null}
        {hint ? <span className="mt-1 block text-[11.5px] text-[var(--muted)]">{hint}</span> : null}
      </label>
    );
  };

  return (
    <div className="dcr-rise space-y-4.5">
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-3.5">
        <span className="min-w-52 flex-1 text-[13.5px]">
          <strong>{METHOD_LABEL[result.method] ?? result.method}</strong>
          <span className="text-[var(--muted)]">
            {" · "}
            {file?.name}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setPhase("pick");
            setResult(null);
            setFields(null);
          }}
          className="h-9 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[12.5px] font-bold text-[var(--navy-text)]"
        >
          Choose another file
        </button>
      </div>

      {result.duplicateOf ? (
        <Banner tone="red">
          Invoice {result.duplicateOf.invoiceNo} of {result.duplicateOf.invoiceDate} is already stored.{" "}
          <a href={`/finance/gst/${result.duplicateOf.id}`} className="font-semibold">
            Open it
          </a>
          .
        </Banner>
      ) : null}
      {result.llmNote ? <Banner tone="amber">{result.llmNote}</Banner> : null}
      {result.conflicts.length ? (
        <Banner tone="amber">
          Gemini read {result.conflicts.length} field{result.conflicts.length === 1 ? "" : "s"} differently from the text
          parser. The parser&apos;s value is filled in; check the highlighted fields.
        </Banner>
      ) : null}
      {liveIssues.length ? (
        liveIssues.map((i, n) => (
          <Banner key={`${i.code}-${n}`} tone="amber">
            {i.message}
          </Banner>
        ))
      ) : (
        <Banner tone="green">Everything adds up: lines, tax and total agree.</Banner>
      )}

      <Section title="Bill">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={labelCls}>Type</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} className={inputCls}>
              <option value="purchase">Purchase — a supplier billed us</option>
              <option value="sales">Sale — we billed a customer</option>
            </select>
          </label>
          <label>
            <span className={labelCls}>Document</span>
            <select
              value={fields.docType}
              onChange={(e) => {
                set("docType", e.target.value);
                if (e.target.value === "bill_of_supply") setItcEligible(false);
              }}
              className={inputCls}
            >
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {DOC_TYPE_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          {field({ k: "invoiceNo", ref: true })}
          {field({ k: "invoiceDate", type: "date" })}
          <label>
            <span className={labelCls}>Place of supply</span>
            <select value={fields.placeOfSupply} onChange={(e) => set("placeOfSupply", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {Object.entries(STATE_CODES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Reverse charge</span>
            <select value={fields.reverseCharge} onChange={(e) => set("reverseCharge", e.target.value)} className={inputCls}>
              <option value="no">No</option>
              <option value="yes">Yes — the buyer pays the GST</option>
            </select>
          </label>
          {isNote ? (
            <>
              {field({ k: "refInvoiceNo", ref: true })}
              {field({ k: "refInvoiceDate", type: "date" })}
            </>
          ) : null}
        </div>
      </Section>

      {purchase ? (
        <Section title="Supplier">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label>
              <span className={labelCls}>Supplier *</span>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={`${inputCls} ${fieldErrors.supplierId ? "border-[var(--red-text)]" : ""}`}
              >
                <option value="">Pick a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.gstin ? ` · ${s.gstin}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {!addingSupplier ? (
              <button
                type="button"
                onClick={() => setAddingSupplier(true)}
                className="h-10 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)]"
              >
                + Add supplier
              </button>
            ) : null}
          </div>
          {fields.sellerName ? (
            <p className="mb-3 text-[12.5px] text-[var(--muted)]">
              The bill is from <strong className="text-[var(--ink)]">{fields.sellerName}</strong>
              {fields.sellerGstin ? <span className="ref"> · {fields.sellerGstin}</span> : null}
              {result.supplierId ? " — matched by GSTIN." : " — not in your supplier list yet."}
            </p>
          ) : null}
          {addingSupplier ? (
            <SupplierForm
              initial={{
                name: fields.sellerName,
                gstin: fields.sellerGstin,
                pan: fields.sellerPan,
                address: fields.sellerAddress,
                state: fields.sellerState,
                pincode: fields.sellerPincode,
                phone: fields.sellerPhone,
                email: fields.sellerEmail,
              }}
              onSaved={(s) => {
                setSuppliers((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
                setSupplierId(String(s.id));
                setAddingSupplier(false);
              }}
              onCancel={() => setAddingSupplier(false)}
            />
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field({ k: "sellerGstin", ref: true })}
            {field({ k: "buyerGstin", ref: true, hint: "Ours — the GSTIN the bill is addressed to." })}
          </div>
        </Section>
      ) : (
        <Section title="Customer">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field({ k: "buyerName" })}
            {field({ k: "buyerGstin", ref: true, hint: "Leave empty for an unregistered customer." })}
            {field({ k: "sellerGstin", ref: true, hint: "Ours — the GSTIN the bill was issued from." })}
          </div>
        </Section>
      )}

      <Section title={`Lines (${fields.items.length})`}>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                <th className="w-[108px] pr-2 pb-2">Kind</th>
                <th className="pr-2 pb-2">Description</th>
                <th className="w-[100px] pr-2 pb-2">HSN/SAC</th>
                <th className="w-[84px] pr-2 pb-2">Qty</th>
                <th className="w-[64px] pr-2 pb-2">Unit</th>
                <th className="w-[96px] pr-2 pb-2">Rate</th>
                <th className="w-[112px] pr-2 pb-2">Taxable ₹</th>
                <th className="w-[68px] pr-2 pb-2">GST %</th>
                <th className="w-8 pb-2" />
              </tr>
            </thead>
            <tbody>
              {fields.items.map((it, i) => (
                <tr key={i} className="align-top">
                  <td className="pr-2 pb-2">
                    <select value={it.kind} onChange={(e) => setItem(i, "kind", e.target.value)} className={smallInput}>
                      {ITEM_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ITEM_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2 pb-2">
                    <input value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} className={smallInput} />
                  </td>
                  <td className="pr-2 pb-2">
                    <input value={it.hsnSac} onChange={(e) => setItem(i, "hsnSac", e.target.value)} className={`${smallInput} ref`} />
                  </td>
                  <td className="pr-2 pb-2">
                    <input inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className={`${smallInput} ref text-right`} />
                  </td>
                  <td className="pr-2 pb-2">
                    <input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className={smallInput} />
                  </td>
                  <td className="pr-2 pb-2">
                    <input inputMode="decimal" value={it.rate} onChange={(e) => setItem(i, "rate", e.target.value)} className={`${smallInput} ref text-right`} />
                  </td>
                  <td className="pr-2 pb-2">
                    <input
                      inputMode="decimal"
                      value={it.taxableValue}
                      onChange={(e) => setItem(i, "taxableValue", e.target.value)}
                      className={`${smallInput} ref text-right`}
                    />
                  </td>
                  <td className="pr-2 pb-2">
                    <input inputMode="decimal" value={it.gstRate} onChange={(e) => setItem(i, "gstRate", e.target.value)} className={`${smallInput} ref text-right`} />
                  </td>
                  <td className="pb-2">
                    <button
                      type="button"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => setFields((f) => (f ? { ...f, items: f.items.filter((_, j) => j !== i) } : f))}
                      className="h-9 w-8 cursor-pointer text-[16px] text-[var(--red-text)]"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFields((f) => (f ? { ...f, items: [...f.items, { ...EMPTY_ITEM }] } : f))}
            className="h-9 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-3.5 text-[12.5px] font-bold text-[var(--navy-text)]"
          >
            + Add line
          </button>
          <span className="text-[12.5px] text-[var(--muted)]">
            Freight or packing below the items is a <strong>Charge</strong>; a discount is a <strong>Discount</strong> with a
            minus amount.
          </span>
          <span className="num ml-auto text-[13px]">
            Lines add up to <strong>₹{money(lines)}</strong>
          </span>
        </div>
      </Section>

      <Section title="Totals">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field({ k: "taxableValue", type: "decimal", ref: true })}
          {field({ k: "cgst", type: "decimal", ref: true })}
          {field({ k: "sgst", type: "decimal", ref: true })}
          {field({ k: "igst", type: "decimal", ref: true })}
          {field({ k: "cess", type: "decimal", ref: true })}
          {field({ k: "tcs", type: "decimal", ref: true })}
          {field({ k: "roundOff", type: "decimal", ref: true })}
          {field({ k: "total", type: "decimal", ref: true })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--muted)]">
          {Math.abs(lines - amt(fields.taxableValue)) > 0.005 && fields.items.length ? (
            <button
              type="button"
              onClick={() => set("taxableValue", money(lines))}
              className="h-8 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-bold text-[var(--navy-text)]"
            >
              Set taxable value to the lines&apos; ₹{money(lines)}
            </button>
          ) : null}
          <span>
            GST on this bill: <strong className="num text-[var(--ink)]">₹{money(tax)}</strong>
            {purchase ? " — input tax credit, if eligible" : " — output tax"}
          </span>
        </div>
      </Section>

      <Section title="e-Invoice and references">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field({ k: "irn", ref: true, wide: true })}
          {field({ k: "ackNo", ref: true })}
          {field({ k: "ackDate", type: "date" })}
          {field({ k: "ewayBillNo", ref: true })}
          {field({ k: "buyerOrderNo", ref: true })}
        </div>
      </Section>

      <Section title="Where it goes">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="gst-project">
              Project (optional)
            </label>
            <Combobox
              id="gst-project"
              placeholder="Stock or office — not one site"
              emptyLabel="Not for one site"
              value={projectId}
              onChange={setProjectId}
              invalid={Boolean(fieldErrors.projectId)}
              options={projects.map((p) => ({ value: p.id, label: p.label }))}
            />
          </div>
          {purchase ? (
            <label className="flex items-start gap-2.5 self-end pb-2 text-[13px]">
              <input
                type="checkbox"
                checked={itcEligible}
                disabled={fields.docType === "bill_of_supply"}
                onChange={(e) => setItcEligible(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--orange)]"
              />
              <span>
                GST can be claimed as input tax credit
                <span className="block text-[11.5px] text-[var(--muted)]">
                  Untick for blocked credit: food, personal use, a car.
                </span>
              </span>
            </label>
          ) : null}
          <label className="sm:col-span-2">
            <span className={labelCls}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--orange)]"
            />
          </label>
        </div>
      </Section>

      {error ? (
        <p role="alert" className="text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={phase === "saving" || (purchase && !supplierId)}
          onClick={save}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {phase === "saving" ? "Saving…" : "Save bill"}
        </button>
        {purchase && !supplierId ? (
          <span className="self-center text-[12.5px] text-[var(--muted)]">Pick or add the supplier first.</span>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
      <h2 className="mb-3.5 text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: "red" | "amber" | "green"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "border-[var(--red-border)] bg-[var(--red-surface)] text-[var(--red-text)]"
      : tone === "green"
        ? "border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]"
        : "border-[var(--amber-border)] bg-[var(--amber-surface)] text-[var(--amber-body)]";
  return <div className={`rounded-[var(--radius)] border px-4 py-3 text-[13px] ${cls}`}>{children}</div>;
}
