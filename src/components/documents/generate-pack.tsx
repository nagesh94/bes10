"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  generateAll,
  generateDocument,
  saveInspectionDates,
  saveProcurement,
  setPortalUploaded,
} from "@/app/actions/generate";
import { deleteDocument, getDocumentUrl } from "@/app/actions/documents";
import { useConfirm } from "@/components/shell/confirm";
import { saveFile } from "@/lib/documents/open-file";
import type { Stage7DocType } from "@/lib/documents/portal-pack";

const cell =
  "h-11 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const primary =
  "h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60";
const secondary =
  "h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--navy-text)] disabled:opacity-60";

export interface GeneratedDoc {
  docType: Stage7DocType;
  label: string;
  note: string;
  documentId: string | null;
  fileName: string | null;
  generatedAt: Date | string | null;
}

function when(v: Date | string | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The four documents this app produces, each on its own row.
 *
 * "Generate the whole set" is the normal path — the whole point is one click
 * at the end of the job — but each row can be regenerated on its own, which
 * is what happens when a DISCOM clerk sends one back over a single field.
 */
export function GeneratePack({
  projectId,
  docs,
  stage = 7,
  canDelete = false,
  missingFields = [],
}: {
  projectId: string;
  docs: GeneratedDoc[];
  /** Which stage's set this is — 7 is the submission pack, 8 the certificate. */
  stage?: 7 | 8;
  /** Admin only — the caller passes `can(actor, "document.delete")`. */
  canDelete?: boolean;
  /**
   * The inspection-date and procurement fields still missing, from
   * `gateMissingFields`. Non-empty locks every Generate button — the server
   * action refuses the same way, this just says why before the click.
   */
  missingFields?: string[];
}) {
  const t = useTranslations("documents.gen");
  const router = useRouter();
  const ask = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Stage7DocType, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const locked = missingFields.length > 0;

  async function one(docType: Stage7DocType) {
    if (locked) return;
    setBusy(docType);
    setNotice(null);
    setErrors((e) => ({ ...e, [docType]: undefined }));
    const result = await generateDocument(projectId, docType);
    setBusy(null);
    if (!result.ok) {
      setErrors((e) => ({ ...e, [docType]: result.error }));
      return;
    }
    setNotice(`${result.fileName} is ready.`);
    router.refresh();
  }

  async function all() {
    if (locked) return;
    setBusy("ALL");
    setNotice(null);
    setErrors({});
    const result = await generateAll(projectId, stage);
    setBusy(null);
    const next: Partial<Record<Stage7DocType, string>> = {};
    for (const f of result.failed) next[f.docType] = f.error;
    setErrors(next);
    setNotice(
      result.generated.length
        ? t("nGenerated", { count: result.generated.length })
        : null,
    );
    router.refresh();
  }

  /**
   * Saved rather than opened in a tab: these go to a printer or up to the
   * portal, and a technician on a phone wants the file on the device, not a
   * viewer they then have to re-download from.
   */
  async function download(documentId: string) {
    setBusy(documentId);
    const result = await getDocumentUrl(documentId, "original", "attachment");
    setBusy(null);
    if (result.ok) saveFile(result.url);
  }

  async function remove(d: GeneratedDoc) {
    if (!d.documentId) return;
    const answer = await ask({
      title: t("deleteTitle", { label: d.label }),
      body: t("deleteBody"),
      confirmLabel: t("deleteIt"),
      reason: {},
    });
    if (!answer.confirmed) return;

    setBusy(d.documentId);
    setErrors((e) => ({ ...e, [d.docType]: undefined }));
    const result = await deleteDocument(d.documentId, answer.reason);
    setBusy(null);
    if (!result.ok) {
      setErrors((e) => ({ ...e, [d.docType]: result.error }));
      return;
    }
    router.refresh();
  }

  const ready = docs.filter((d) => d.documentId).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <h2 className="mb-0.5 text-base font-bold">{t("title")}</h2>
          <p className="text-[13px] text-[var(--muted)]">{t("printReady")}</p>
        </div>
        <span
          className={`ref shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
            ready >= docs.length
              ? "bg-[var(--green-soft)] text-[var(--green-text)]"
              : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
          }`}
        >
          {t("xOfY", { x: ready, y: docs.length })}
        </span>
      </div>

      {locked ? (
        <div
          role="alert"
          className="mb-4 rounded-[9px] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--amber-body)]"
        >
          <strong className="block font-bold text-[var(--amber-text)]">
            {t("locked")}
          </strong>
          {t("stillMissing", {
            fields: missingFields
              .map((f) => {
                const k = `missing.${f.replace(/\s+/g, "_")}`;
                return t.has(k) ? t(k) : f;
              })
              .join(", "),
          })}
        </div>
      ) : null}

      <div className="mb-4 overflow-hidden rounded-[9px] border border-[var(--line)]">
        {docs.map((d, i) => (
          <div
            key={d.docType}
            className={`flex flex-wrap items-center gap-3 px-4 py-3.5 ${
              i < docs.length - 1 ? "border-b border-[var(--line-soft)]" : ""
            } ${d.documentId ? "" : "bg-[var(--surface-2)]"}`}
          >
            <span
              className={`ref flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                d.documentId
                  ? "bg-[var(--green)] text-[var(--green-ink)]"
                  : "bg-[var(--chip-soft)] text-[var(--muted-soft)]"
              }`}
            >
              {d.documentId ? "✓" : i + 1}
            </span>

            <span className="min-w-48 flex-1">
              <span className="block text-[14px] font-semibold">{d.label}</span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">
                {d.documentId ? (
                  <>
                    <span className="ref">{d.fileName}</span>
                    {d.generatedAt ? ` · ${when(d.generatedAt)}` : ""}
                  </>
                ) : (
                  d.note
                )}
              </span>
              {errors[d.docType] ? (
                <span role="alert" className="mt-1 block text-[12px] font-medium text-[var(--red-text)]">
                  {errors[d.docType]}
                </span>
              ) : null}
            </span>

            <span className="flex shrink-0 gap-2">
              {d.documentId ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void download(d.documentId!)}
                  className={secondary}
                >
                  {t("download")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy !== null || locked}
                onClick={() => void one(d.docType)}
                className={secondary}
              >
                {busy === d.docType
                  ? t("generating")
                  : d.documentId
                    ? t("regenerate")
                    : t("generate")}
              </button>
              {d.documentId && canDelete ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void remove(d)}
                  className="h-10 cursor-pointer rounded-lg border border-[var(--red-border)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--red-text)] disabled:opacity-60"
                >
                  {t("delete")}
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy !== null || locked} onClick={() => void all()} className={primary}>
          {busy === "ALL"
            ? t("generating")
            : docs.length === 1
              ? t("generateIt")
              : t("generateAll")}
        </button>
        {notice ? (
          <span className="text-[13px] font-semibold text-[var(--green-text)]">{notice}</span>
        ) : null}
      </div>
    </div>
  );
}

export interface PortalRow {
  docType: string;
  label: string;
  hint: string;
  documentId: string | null;
  uploaded: boolean;
}

/**
 * The portal upload checklist.
 *
 * This app cannot upload to PM Surya Ghar — there is no API — so this is an
 * honest record of what a person did on another website. A row with no
 * document behind it cannot be ticked, because there would be nothing to have
 * uploaded.
 */
export function PortalChecklist({
  projectId,
  rows,
  portalUrl,
}: {
  projectId: string;
  rows: PortalRow[];
  portalUrl: string;
}) {
  const t = useTranslations("documents.gen");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = rows.filter((r) => r.uploaded).length;

  async function toggle(row: PortalRow) {
    if (!row.documentId) return;
    setBusy(row.docType);
    setError(null);
    const result = await setPortalUploaded(projectId, row.documentId, !row.uploaded);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <h2 className="mb-0.5 text-base font-bold">{t("portalTitle")}</h2>
          <p className="text-[13px] text-[var(--muted)]">{t("tickManually")}</p>
        </div>
        <span
          className={`ref shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
            done >= rows.length
              ? "bg-[var(--green-soft)] text-[var(--green-text)]"
              : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
          }`}
        >
          {t("xOfY", { x: done, y: rows.length })}
        </span>
      </div>

      <a
        href={portalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-4 flex items-center gap-3 rounded-[9px] bg-[var(--navy)] px-4 py-3.5 text-[var(--navy-ink)] no-underline"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t("openPortal")}</span>
          <span className="ref mt-0.5 block text-[11.5px] opacity-75">
            {t("opensNewTab")}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-base">
          &#8599;
        </span>
      </a>

      <div className="overflow-hidden rounded-[9px] border border-[var(--line)]">
        {rows.map((row, i) => (
          <label
            key={row.docType}
            className={`flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 ${
              i < rows.length - 1 ? "border-b border-[var(--line-soft)]" : ""
            } ${row.documentId ? "" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="checkbox"
              checked={row.uploaded}
              disabled={!row.documentId || busy !== null}
              onChange={() => void toggle(row)}
              className="h-[18px] w-[18px] shrink-0 accent-[var(--orange)]"
            />
            <span className="min-w-44 flex-1">
              <span
                className={`block text-[13.5px] font-semibold ${
                  row.uploaded ? "text-[var(--muted)] line-through" : ""
                }`}
              >
                {row.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">
                {row.documentId ? row.hint : t("notOnFile")}
              </span>
            </span>
            {busy === row.docType ? (
              <span className="shrink-0 text-[11.5px] font-semibold text-[var(--muted)]">
                {t("saving")}
              </span>
            ) : null}
          </label>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * The four procurement fields the DCR undertaking names by name.
 *
 * They live here rather than on stage 3 because this is where they are first
 * needed and where their absence actually blocks something — the undertaking
 * refuses to generate without them.
 */
export function ProcurementForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    purchaseOrderNo: string;
    purchaseOrderDate: string;
    cellManufacturer: string;
    cellGstInvoiceNo: string;
  };
}) {
  const t = useTranslations("documents.gen");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const fields: Array<[keyof typeof initial, string, string, "text" | "date"]> = [
    ["purchaseOrderNo", t("procFields.purchaseOrderNo"), "22", "text"],
    ["purchaseOrderDate", t("procFields.purchaseOrderDate"), "", "date"],
    ["cellManufacturer", t("procFields.cellManufacturer"), "Waaree Energies Limited", "text"],
    ["cellGstInvoiceNo", t("procFields.cellGstInvoiceNo"), "WEL/26/44821", "text"],
  ];

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">{t("procTitle")}</h2>
      <p className="mb-4 text-[13px] text-[var(--muted)]">{t("procIntro")}</p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {fields.map(([key, label, placeholder, type]) => (
          <div key={key}>
            <label className={labelCls} htmlFor={key}>{label}</label>
            <input
              id={key}
              type={type}
              value={v[key]}
              onChange={(e) => {
                setV((o) => ({ ...o, [key]: e.target.value }));
                setSaved(false);
              }}
              {...(placeholder ? { placeholder } : {})}
              {...(key === "purchaseOrderDate" ? { max: today } : {})}
              className={`${cell} ${type === "text" ? "ref" : ""}`}
            />
          </div>
        ))}
      </div>

      {error ? <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await saveProcurement(projectId, v);
          setPending(false);
          if (!result.ok) return setError(result.error);
          setSaved(true);
          router.refresh();
        }}
        className={primary}
      >
        {pending ? t("saving") : saved ? t("saved") : t("procSave")}
      </button>
    </div>
  );
}

/**
 * The three dates the DISCOM fills in at inspection.
 *
 * Left blank on the printed form by default, which was explicit: commissioning
 * and joint inspection happen after the report is submitted. Once they are
 * known, entering them here and regenerating prints them instead of blanks.
 */
export function InspectionDates({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    commissioningDate: string;
    jointInspectionDate: string;
    performanceCheckDate: string;
  };
}) {
  const t = useTranslations("documents.gen");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const fields: Array<[keyof typeof initial, string, string]> = [
    ["performanceCheckDate", t("dateFields.performanceCheckDate.label"), t("dateFields.performanceCheckDate.hint")],
    ["commissioningDate", t("dateFields.commissioningDate.label"), t("dateFields.commissioningDate.hint")],
    ["jointInspectionDate", t("dateFields.jointInspectionDate.label"), t("dateFields.jointInspectionDate.hint")],
  ];

  return (
    <div>
      <h2 className="mb-0.5 text-base font-bold">{t("datesTitle")}</h2>
      <p className="mb-4 text-[13px] text-[var(--muted)]">{t("datesIntro")}</p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {fields.map(([key, label, hint]) => (
          <div key={key}>
            <label className={labelCls} htmlFor={key}>{label}</label>
            <input
              id={key}
              type="date"
              value={v[key]}
              onChange={(e) => {
                setV((o) => ({ ...o, [key]: e.target.value }));
                setSaved(false);
              }}
              {...(key === "commissioningDate" ? {} : { max: today })}
              className={cell}
            />
            <p className="mt-1 text-[11px] text-[var(--muted-soft)]">{hint}</p>
          </div>
        ))}
      </div>

      {error ? <p role="alert" className="mb-3 text-[13px] font-medium text-[var(--red-text)]">{error}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await saveInspectionDates(projectId, v);
          setPending(false);
          if (!result.ok) return setError(result.error);
          setSaved(true);
          router.refresh();
        }}
        className={primary}
      >
        {pending ? t("saving") : saved ? t("saved") : t("datesSave")}
      </button>
    </div>
  );
}
