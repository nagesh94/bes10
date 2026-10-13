import { shortDate } from "@/lib/admin/format";
import { ActivateButton, TemplateUpload } from "./template-controls";

export interface TemplateView {
  id: number;
  name: string;
  docType: string;
  version: number;
  engine: string;
  active: boolean;
  onLetterhead: boolean;
  uploadedAt: Date;
  fieldCount: number | null;
}

function engineClass(engine: string): string {
  if (engine === "DOCX") return "bg-[var(--navy-soft)] text-[var(--link)]";
  if (engine === "PDF_FORM") return "bg-[var(--green-soft)] text-[var(--green-text)]";
  return "bg-[var(--amber-soft)] text-[var(--amber-text)]";
}

export function TemplateList({
  templates,
  className = "min-w-80 flex-[1_1_400px] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]",
}: {
  templates: TemplateView[];
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-4">
        <h2 className="m-0 flex-1 text-base font-bold">Document templates</h2>
        <TemplateUpload />
      </div>

      {templates.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--muted)]">
          No templates yet. Upload a Word file or a flat PDF to start a version.
        </p>
      ) : (
        templates.map((template) => (
          <div key={template.id} className="border-b border-[var(--line-soft)] px-5 py-[13px]">
            <div className="mb-1 flex flex-wrap items-center gap-2.5">
              <span className="min-w-0 flex-1 text-sm font-semibold">{template.name}</span>
              <span className={`ref inline-block shrink-0 rounded px-[7px] py-[3px] text-[10px] font-medium tracking-[0.04em] ${engineClass(template.engine)}`}>
                {template.engine}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="ref text-[11.5px] text-[var(--muted)]">
                v{template.version} · {shortDate(template.uploadedAt)}
                {template.fieldCount != null ? ` · ${template.fieldCount} fields` : ""}
                {template.onLetterhead ? " · letterhead" : ""}
              </span>
              <span className="flex-1" />
              <span
                className={`inline-block rounded-full px-[9px] py-[3px] text-[10.5px] font-bold ${
                  template.active
                    ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                    : "bg-[var(--chip-soft)] text-[var(--chip-text)]"
                }`}
              >
                {template.active ? "Active" : "Superseded"}
              </span>
              {template.active ? null : <ActivateButton id={template.id} />}
            </div>
          </div>
        ))
      )}

      <div className="bg-[var(--surface-2)] px-5 py-[15px]">
        <p className="m-0 text-[12.5px] leading-relaxed text-[var(--muted)]">
          Word templates are the ones your team can edit directly. Flat government PDFs are filled by coordinates, so changing one needs a developer.
        </p>
      </div>
    </section>
  );
}
