import Link from "next/link";
import { UploadSlot, type ExistingDoc } from "./upload-slot";
import { bankPackFor, estimatedPages, physicalItemsFor } from "@/lib/documents/bank-pack";
import type { DocType } from "@/lib/documents/types";

/**
 * Everything the bank needs, in the order they want it filed.
 *
 * Items collected earlier in the pipeline are shown as already held, with a
 * link back to where they live, rather than offering a second upload slot
 * for the same document — two places to upload an Aadhaar card is how you
 * end up with two different Aadhaar cards.
 */
export function BankFile({
  projectId,
  docFor,
  hasCoApplicant = false,
  canDelete = false,
}: {
  projectId: string;
  docFor: (type: string) => ExistingDoc | null;
  hasCoApplicant?: boolean;
  canDelete?: boolean;
}) {
  // A co-applicant adds their identity set, filed before the quotation.
  const items = bankPackFor(hasCoApplicant);
  const physical = physicalItemsFor(hasCoApplicant);
  const held = items.filter((i) => docFor(i.docType)).length;
  const total = items.length;
  const complete = held === total;

  const sourceHref: Record<string, string> = {
    stage1: `/projects/${projectId}/stage-1`,
    stage2: `/projects/${projectId}/stage-2`,
  };

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--line)] bg-[var(--surface-2)] px-6 py-4">
        <div className="min-w-60 flex-1">
          <h2 className="text-[17px] font-bold">Bank file</h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
            The soft copy the bank needs. Phase 4 prints the whole thing in one click.
          </p>
        </div>
        <span
          className={`ref rounded-full px-3 py-1.5 text-[12px] font-bold ${
            complete
              ? "bg-[var(--green-soft)] text-[var(--green-text)]"
              : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
          }`}
        >
          {held} of {total}
        </span>
      </div>

      <div className="px-6 py-5">
        <ol className="space-y-2.5">
          {items.map((item, i) => {
            const existing = docFor(item.docType);
            const elsewhere = item.source !== "portal";

            // Collected earlier: show it as held, link to where it lives.
            if (elsewhere) {
              return (
                <li
                  key={item.docType}
                  className="flex flex-wrap items-center gap-3 rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3"
                >
                  <span
                    className={`ref flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold ${
                      existing
                        ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                        : "bg-[var(--chip-soft)] text-[var(--muted-soft)]"
                    }`}
                  >
                    {existing ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold">{item.label}</span>
                    <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
                      {existing ? (existing.fileName ?? "on file") : item.hint}
                    </span>
                  </span>
                  <Link
                    href={sourceHref[item.source]!}
                    className="h-9 shrink-0 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] leading-9 font-semibold text-[var(--ink)] no-underline"
                  >
                    {existing ? "View" : "Add it"}
                  </Link>
                </li>
              );
            }

            // Comes from a government portal: upload it here.
            return (
              <li key={item.docType}>
                <UploadSlot
                  projectId={projectId}
                  docType={item.docType as DocType}
                  label={`${i + 1}. ${item.label}`}
                  hint={item.hint}
                  existing={existing}
                  canDelete={canDelete}
                />
              </li>
            );
          })}
        </ol>

        <div className="mt-5 rounded-[9px] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3.5">
          <div className="mb-2 text-[12px] font-semibold text-[var(--amber-text)]">
            Attach by hand
          </div>
          {physical.map((p) => (
            <div key={p.label} className="flex items-start gap-2.5 py-1.5">
              <span className="mt-0.5 block h-4 w-4 shrink-0 rounded-[4px] border-[1.5px] border-[var(--amber-border)] bg-[var(--surface)]" />
              <span className="min-w-0 flex-1">
                <span className="text-[13.5px] text-[var(--amber-body)]">{p.label}</span>
                {p.note ? (
                  <span className="block text-[11.5px] text-[var(--amber-body)] opacity-80">
                    {p.note}
                  </span>
                ) : null}
              </span>
              <span className="ref shrink-0 text-[12.5px] font-medium text-[var(--amber-text)]">
                {p.qty}
              </span>
            </div>
          ))}
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--amber-body)]">
            These are objects, not files, so they cannot be printed. They appear on the cover
            checklist instead.
          </p>
        </div>

        <p className="mt-4 text-[12.5px] text-[var(--muted)]">
          Around <span className="ref">{estimatedPages(hasCoApplicant)} pages</span> once printed, plus the cover
          checklist. Exact counts come from the real files.
        </p>
      </div>
    </section>
  );
}
