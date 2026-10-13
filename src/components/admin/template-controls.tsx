"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { activateTemplate, uploadTemplate } from "@/app/actions/admin-templates";
import { DOC_TYPES, type DocType } from "@/lib/documents/types";
import { TEMPLATE_ENGINES } from "@/lib/validation/admin";

const GENERATED: DocType[] = [
  "AGREEMENT",
  "WORK_COMPLETION",
  "JOINT_INSPECTION",
  "ALMM_DECLARATION",
  "DCR_UNDERTAKING",
  "COMMISSIONING_CERT",
];

const field =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1 block text-xs font-semibold text-[var(--muted)]";

export function TemplateUpload() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<string>("AGREEMENT");
  const [name, setName] = useState<string>(DOC_TYPES.AGREEMENT.label);
  const [nameTouched, setNameTouched] = useState(false);
  const [engine, setEngine] = useState<(typeof TEMPLATE_ENGINES)[number]>("DOCX");
  const [letterhead, setLetterhead] = useState(false);

  function chooseType(next: string) {
    setDocType(next);
    if (next === "ALMM_DECLARATION") setLetterhead(true);
    if (!nameTouched && next !== "OTHER" && next in DOC_TYPES) {
      setName(DOC_TYPES[next as DocType].label);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set("docType", docType === "OTHER" ? String(data.get("customType") ?? "") : docType);
    data.set("onLetterhead", letterhead ? "true" : "false");
    data.set("engine", engine);
    data.set("name", name);
    const result = await uploadTemplate(data);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setOpen(false);
    setPending(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[38px] cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink)]"
      >
        Upload
      </button>
      {open ? (
        <form onSubmit={onSubmit} className="mt-1 basis-full border-t border-[var(--line-soft)] pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="tpl-name">Name</label>
              <input id="tpl-name" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} required className={field} />
            </div>
            <div>
              <label className={label} htmlFor="tpl-type">Document</label>
              <select id="tpl-type" value={docType} onChange={(e) => chooseType(e.target.value)} className={field}>
                {GENERATED.map((type) => (
                  <option key={type} value={type}>{DOC_TYPES[type].label}</option>
                ))}
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="tpl-engine">Engine</label>
              <select id="tpl-engine" value={engine} onChange={(e) => setEngine(e.target.value as (typeof TEMPLATE_ENGINES)[number])} className={field}>
                {TEMPLATE_ENGINES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            {docType === "OTHER" ? (
              <div className="sm:col-span-2">
                <label className={label} htmlFor="tpl-code">Document code</label>
                <input id="tpl-code" name="customType" placeholder="AGREEMENT" className={`${field} ref`} />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className={label} htmlFor="tpl-file">File</label>
              <input id="tpl-file" name="file" type="file" required accept={engine === "DOCX" ? ".docx" : ".pdf"} className="block w-full text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
              <input type="checkbox" checked={letterhead} onChange={(e) => setLetterhead(e.target.checked)} className="h-4 w-4 accent-[var(--orange)]" />
              Print on the company letterhead
            </label>
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-[var(--red-text)]">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={pending} className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-3.5 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60">
              {pending ? "Uploading…" : "Save version"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-10 cursor-pointer rounded-lg border border-[var(--line)] px-3.5 text-[13px] font-semibold text-[var(--ink)]">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

export function ActivateButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await activateTemplate(id);
        setPending(false);
        router.refresh();
      }}
      className="cursor-pointer text-[12px] font-semibold text-[var(--link)]"
    >
      Make active
    </button>
  );
}
