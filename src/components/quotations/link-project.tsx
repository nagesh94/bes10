"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { linkQuotationToProject } from "@/app/actions/quotations";

/**
 * Attaching a quotation to a project after the fact.
 *
 * The counter case this exists for: someone walks in, is quoted on the
 * spot, and only becomes a lead when they say yes. The quotation they are
 * holding then has to join the project rather than be retyped under a new
 * number — so this moves the existing one, keeping its number and its PDF.
 *
 * Attaching is not an edit of the offer, so it is a control of its own
 * rather than a field in the form. Saving is explicit: picking a project
 * from the list does nothing until the button is pressed, because detaching
 * a quotation takes it out of the bank pack.
 */
export function LinkProject({
  id,
  projectId,
  projects,
}: {
  id: string;
  projectId: string | null;
  projects: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(projectId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = projectId ?? "";
  const changed = choice !== current;
  const detaching = changed && choice === "";

  async function save() {
    setPending(true);
    setError(null);
    const result = await linkQuotationToProject({ id, projectId: choice });
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="border-t border-[var(--line-soft)] pt-4">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-56 flex-1">
          <label
            htmlFor="attach-project"
            className="mb-1.5 block text-xs font-semibold text-[var(--muted)]"
          >
            Attached to project
          </label>
          <select
            id="attach-project"
            value={choice}
            disabled={pending}
            onChange={(event) => setChoice(event.target.value)}
            className="h-11 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[14.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
          >
            <option value="">Not attached — standalone</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={pending || !changed}
          onClick={save}
          className={`h-11 rounded-lg px-4 text-sm font-bold ${
            changed
              ? detaching
                ? "cursor-pointer border border-[var(--red-border)] bg-[var(--surface)] text-[var(--red-text)]"
                : "cursor-pointer bg-[var(--orange)] text-[var(--orange-ink)]"
              : "cursor-not-allowed border border-[var(--line)] bg-[var(--chip-soft)] text-[var(--muted-soft)]"
          }`}
        >
          {pending
            ? "Saving…"
            : !changed
              ? current
                ? "Attached"
                : "Attach"
              : detaching
                ? "Detach"
                : current
                  ? "Move to this project"
                  : "Attach"}
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
        {detaching
          ? "Detaching takes the PDF out of that project’s documents and out of the bank loan pack. The quotation keeps its number and its file."
          : "Attaching files this PDF as the project’s quotation, so the bank loan pack picks it up without a separate upload. The number and the wording do not change."}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
