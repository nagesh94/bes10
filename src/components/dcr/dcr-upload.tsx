"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  extractDcr,
  saveDcrCertificate,
  type ExtractResult,
  type SupplierOption,
} from "@/app/actions/dcr";
import { normaliseSerial, type DcrFields, type DcrScalarKey } from "@/lib/dcr/fields";
import { checkConsistency } from "@/lib/dcr/merge";
import { ChainOfCustody } from "./chain-of-custody";
import { ReadingProgress } from "./reading-progress";
import { SupplierForm, inputCls, labelCls } from "./supplier-form";

type Extracted = Extract<ExtractResult, { ok: true }>;

const METHOD_LABEL: Record<string, string> = {
  parser: "Read by the text parser",
  "parser+llm": "Read by the text parser and checked by Gemini",
  "llm-text": "Read by Gemini from the PDF's text",
  "llm-pdf": "Scanned PDF — read by Gemini from the image",
};

const FIELD_LABEL: Partial<Record<DcrScalarKey, string>> = {
  certificateNo: "Certificate number",
  revision: "Revision",
  certType: "Type",
  certDate: "Certificate date",
  issuedToName: "Issued to",
  issuedToGstin: "Issued to GSTIN",
  purchaseOrderNo: "Purchase order no.",
  invoiceRef: "Invoice / E-way ref",
  invoiceDate: "Invoice date",
  cellManufacturer: "Cell manufacturer",
  cellManufacturerAddress: "Cell manufacturer address",
  moduleManufacturer: "Module manufacturer",
  moduleManufacturerAddress: "Module manufacturer address",
  modelNo: "Model no.",
  moduleDescription: "Description",
  wattPeak: "Wp per module",
  efficiency: "Efficiency %",
  technology: "Cell technology",
  cellModel: "Cell model",
  quantity: "Quantity",
  totalKw: "Total kW",
  supplierName: "Supplier name",
  supplierGstin: "Supplier GSTIN",
};

const SECTIONS: { title: string; keys: { key: DcrScalarKey; type?: "date"; wide?: boolean; ref?: boolean }[] }[] = [
  {
    title: "Certificate",
    keys: [
      { key: "certificateNo", ref: true },
      { key: "revision", ref: true },
      { key: "certType" },
      { key: "certDate", type: "date" },
      { key: "issuedToName" },
      { key: "issuedToGstin", ref: true },
    ],
  },
  {
    title: "Purchase",
    keys: [
      { key: "purchaseOrderNo", ref: true },
      { key: "invoiceRef", ref: true },
      { key: "invoiceDate", type: "date" },
    ],
  },
  {
    title: "Manufacturers",
    keys: [
      { key: "cellManufacturer", wide: true },
      { key: "cellManufacturerAddress", wide: true },
      { key: "moduleManufacturer", wide: true },
      { key: "moduleManufacturerAddress", wide: true },
    ],
  },
  {
    title: "Module",
    keys: [
      { key: "modelNo", ref: true },
      { key: "technology" },
      { key: "moduleDescription", wide: true },
      { key: "wattPeak", ref: true },
      { key: "efficiency", ref: true },
      { key: "cellModel", wide: true },
      { key: "quantity", ref: true },
      { key: "totalKw", ref: true },
    ],
  },
];

/**
 * Upload → read → review → save.
 *
 * The PDF never leaves the browser until save: reading sends it once to be
 * parsed, and saving sends it again with the reviewed fields, so a review
 * that is abandoned stores nothing.
 */
export function DcrUpload({ suppliers: initialSuppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"pick" | "reading" | "review" | "saving">("pick");
  const [result, setResult] = useState<Extracted | null>(null);
  const [fields, setFields] = useState<DcrFields | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [poDate, setPoDate] = useState("");
  const [notes, setNotes] = useState("");
  const [newSerials, setNewSerials] = useState("");
  const [readDone, setReadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function read(f: File) {
    setFile(f);
    setError(null);
    setPhase("reading");
    const fd = new FormData();
    fd.set("file", f);
    let r: ExtractResult;
    try {
      r = await extractDcr(fd);
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
    setSupplierId(r.supplierId ? String(r.supplierId) : "");
    setAddingSupplier(!r.supplierId && Boolean(r.fields.supplierName));
    setPoDate(r.fields.invoiceDate);
    // Let the finished state land — every step ticked, the green check on the
    // page — before the form replaces it.
    setReadDone(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setReadDone(false);
    setPhase("review");
  }

  const set = (key: DcrScalarKey, value: string) => setFields((f) => (f ? { ...f, [key]: value } : f));

  const liveIssues = useMemo(() => (fields ? checkConsistency(fields) : []), [fields]);

  async function save() {
    if (!file || !fields || !result) return;
    setPhase("saving");
    setError(null);
    setFieldErrors({});
    const { chain, serials, ...scalars } = fields;
    const data = {
      ...scalars,
      supplierId,
      purchaseOrderDate: poDate,
      notes,
      chain,
      serials,
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
    const r = await saveDcrCertificate(fd);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      setPhase("review");
      return;
    }
    router.push(`/dcr/${r.id}?saved=${r.projectsUpdated}`);
  }

  if (phase === "reading" && file) {
    return <ReadingProgress fileName={file.name} sizeBytes={file.size} done={readDone} />;
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
            accept="application/pdf,.pdf"
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
          <span className="mb-1 text-base font-bold">Choose or drop the DCR certificate PDF</span>
          <span className="text-[13px] text-[var(--muted)]">As downloaded from the NISE DCR portal. Up to 12 MB.</span>
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

  const conflictFor = (key: DcrScalarKey) => result.conflicts.find((c) => c.key === key);
  const isUnverified = (key: DcrScalarKey) => result.unverified.includes(key);
  const issues = liveIssues.filter((i) => i.code !== "NOT_ADDRESSED_TO_US");
  const addressIssue = result.issues.find((i) => i.code === "NOT_ADDRESSED_TO_US");

  return (
    <div className="dcr-rise space-y-4.5">
      {/* What happened while reading */}
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-3.5">
        <span className="min-w-52 flex-1 text-[13.5px]">
          <strong>{METHOD_LABEL[result.method] ?? result.method}</strong>
          <span className="text-[var(--muted)]">
            {" · "}
            {file?.name}
            {result.method === "parser+llm" && result.conflicts.length === 0 && result.unverified.length === 0
              ? " · every field agrees"
              : ""}
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
          Certificate {result.duplicateOf.certificateNo} is already stored.{" "}
          <a href={`/dcr/${result.duplicateOf.id}`} className="font-semibold">
            Open it
          </a>
          . Delete it first if this is a new revision.
        </Banner>
      ) : null}
      {result.serialClashes.length ? (
        <Banner tone="red">
          {result.serialClashes.length} serial{result.serialClashes.length === 1 ? " is" : "s are"} already on
          another certificate:{" "}
          {result.serialClashes.map((c) => `${c.serialNo} (${c.certificateNo})`).join(", ")}.
        </Banner>
      ) : null}
      {result.llmNote ? <Banner tone="amber">{result.llmNote}</Banner> : null}
      {result.conflicts.length ? (
        <Banner tone="amber">
          Gemini read {result.conflicts.length} field{result.conflicts.length === 1 ? "" : "s"} differently from the
          text parser. The parser&apos;s value is filled in; check the highlighted fields below.
        </Banner>
      ) : null}
      {result.unverified.length ? (
        <Banner tone="amber">
          {result.unverified.map((k) => FIELD_LABEL[k as DcrScalarKey] ?? k).join(", ")}: filled by Gemini but not found in the
          certificate text. Check against the PDF.
        </Banner>
      ) : null}
      {result.droppedSerials.length ? (
        <Banner tone="amber">
          Ignored {result.droppedSerials.length} serial{result.droppedSerials.length === 1 ? "" : "s"} Gemini listed
          that are not on the certificate: {result.droppedSerials.join(", ")}.
        </Banner>
      ) : null}
      {addressIssue ? <Banner tone="amber">{addressIssue.message}</Banner> : null}
      {issues.map((i) => (
        <Banner key={i.code} tone="amber">
          {i.message}
        </Banner>
      ))}

      {/* Supplier */}
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
        {fields.supplierName ? (
          <p className="mb-3 text-[12.5px] text-[var(--muted)]">
            The certificate names{" "}
            <strong className="text-[var(--ink)]">{fields.supplierName}</strong>
            {fields.supplierGstin ? <span className="ref"> · {fields.supplierGstin}</span> : null}
            {result.supplierId ? " — matched by GSTIN." : " — not in your list yet."}
          </p>
        ) : null}
        {addingSupplier ? (
          <SupplierForm
            initial={{
              name: fields.supplierName,
              gstin: fields.supplierGstin,
              pan: fields.supplierPan,
              address: fields.supplierAddress,
              state: fields.supplierState,
              pincode: fields.supplierPincode,
              phone: "",
              email: "",
            }}
            onSaved={(s) => {
              setSuppliers((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
              setSupplierId(String(s.id));
              setAddingSupplier(false);
            }}
            onCancel={() => setAddingSupplier(false)}
          />
        ) : null}
      </Section>

      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {section.keys.map(({ key, type, wide, ref }) => {
              const conflict = conflictFor(key);
              const warn = Boolean(conflict) || isUnverified(key) || Boolean(fieldErrors[key]);
              return (
                <label key={key} className={wide ? "sm:col-span-2" : ""}>
                  <span className={labelCls}>
                    {FIELD_LABEL[key] ?? key}
                    {key === "certificateNo" ? " *" : ""}
                  </span>
                  <input
                    type={type ?? "text"}
                    value={fields[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className={`${inputCls} ${ref ? "ref" : ""} ${
                      warn ? "border-[var(--amber-text)] bg-[var(--amber-surface)]" : ""
                    }`}
                  />
                  {conflict ? (
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--amber-text)]">
                      Gemini read: <span className="ref font-semibold">{conflict.llm}</span>
                      <button
                        type="button"
                        onClick={() => set(key, conflict.llm)}
                        className="cursor-pointer rounded border border-[var(--amber-border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-bold"
                      >
                        Use this
                      </button>
                    </span>
                  ) : null}
                  {fieldErrors[key] ? (
                    <span className="mt-1 block text-[11.5px] text-[var(--red-text)]">{fieldErrors[key]![0]}</span>
                  ) : null}
                </label>
              );
            })}
            {section.title === "Purchase" ? (
              <label>
                <span className={labelCls}>Purchase order date</span>
                <input
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                  className={inputCls}
                />
                <span className="mt-1 block text-[11.5px] text-[var(--muted)]">
                  Not printed on the certificate. Starts as the invoice date; change it to the PO&apos;s own date.
                </span>
              </label>
            ) : null}
          </div>
        </Section>
      ))}

      <Section title={`Panel serial numbers (${fields.serials.length})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          {fields.serials.map((s, i) => {
            const clash = result.serialClashes.some((c) => c.serialNo === s.serialNo);
            return (
              <span
                key={`${s.serialNo}-${i}`}
                className={`ref inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${
                  clash
                    ? "border-[var(--red-border)] bg-[var(--red-surface)] text-[var(--red-text)]"
                    : "border-[var(--line)] bg-[var(--surface-2)]"
                }`}
              >
                {s.serialNo}
                {s.wattPeak ? <span className="text-[var(--muted)]">{s.wattPeak} Wp</span> : null}
                <button
                  type="button"
                  aria-label={`Remove ${s.serialNo}`}
                  onClick={() =>
                    setFields((f) => (f ? { ...f, serials: f.serials.filter((_, j) => j !== i) } : f))
                  }
                  className="cursor-pointer text-[var(--red-text)]"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={newSerials}
            onChange={(e) => setNewSerials(e.target.value)}
            placeholder="Add serials — paste several separated by spaces or commas"
            className={`${inputCls} ref min-w-60 flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              const add = newSerials
                .split(/[\s,;]+/)
                .map(normaliseSerial)
                .filter(Boolean);
              if (!add.length) return;
              setFields((f) =>
                f ? { ...f, serials: [...f.serials, ...add.map((serialNo) => ({ serialNo, wattPeak: f.wattPeak }))] } : f,
              );
              setNewSerials("");
            }}
            className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)]"
          >
            Add
          </button>
        </div>
      </Section>

      {fields.chain.length ? (
        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
          <ChainOfCustody chain={fields.chain} />
        </section>
      ) : null}

      <Section title="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--orange)]"
        />
      </Section>

      {error ? (
        <p role="alert" className="text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={phase === "saving" || !supplierId}
          onClick={save}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {phase === "saving" ? "Saving…" : "Save certificate"}
        </button>
        {!supplierId ? (
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

function Banner({ tone, children }: { tone: "red" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "border-[var(--red-border)] bg-[var(--red-surface)] text-[var(--red-text)]"
      : "border-[var(--amber-border)] bg-[var(--amber-surface)] text-[var(--amber-body)]";
  return <div className={`rounded-[var(--radius)] border px-4 py-3 text-[13px] ${cls}`}>{children}</div>;
}
