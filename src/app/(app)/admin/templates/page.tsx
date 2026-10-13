import { TemplateList } from "@/components/admin/template-list";
import { loadTemplates } from "@/lib/admin/templates";

export default async function TemplatesPage() {
  const templates = await loadTemplates();

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-[26px] pb-14">
      <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Document templates</h1>
      <p className="mb-5 max-w-[760px] text-sm text-[var(--muted)]">
        Upload a new version without a deploy. The previous one stays on file, marked superseded, so an old project keeps the wording it was generated with.
      </p>
      <TemplateList
        templates={templates}
        className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]"
      />
    </main>
  );
}
