"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { saveSection } from "@/app/actions/prospect";
import type { SectionKey } from "@/lib/validation/prospect";
import type { FieldDef, FormSection } from "./fields";

const baseField =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

export function SectionForm({
  projectId,
  section,
  values,
  nextKey,
  hideTitle = false,
  comboOptions = {},
  blockAdvance = false,
  blockAdvanceReason,
}: {
  projectId: string;
  section: FormSection;
  values: Record<string, string | boolean>;
  nextKey: SectionKey | null;
  /** The installer's screens put the section title in the page header. */
  hideTitle?: boolean;
  /** Suggestion lists for "combo" fields, keyed by `FieldDef.comboKey`. */
  comboOptions?: Record<string, string[]>;
  /** Disables "Save and continue" — e.g. required uploads are still missing. */
  blockAdvance?: boolean;
  blockAdvanceReason?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const today = new Date().toISOString().slice(0, 10);

  // Toggles are controlled so the posted value is a real boolean, not "on".
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of section.fields) {
      if (f.type === "toggle") init[f.name] = values[f.name] !== false;
    }
    return init;
  });

  async function submit(event: FormEvent<HTMLFormElement>, advance: boolean) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const f of section.fields) {
      payload[f.name] = f.type === "toggle" ? toggles[f.name] : String(data.get(f.name) ?? "");
    }

    const result = await saveSection(
      projectId,
      section.key as SectionKey | "coApplicant",
      payload,
    );
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    setSaved(true);
    if (advance && nextKey) {
      router.push(`/projects/${projectId}/stage-1?section=${nextKey}`);
    }
    router.refresh();
  }

  function renderField(f: FieldDef) {
    const errs = fieldErrors[f.name];
    const defaultValue = typeof values[f.name] === "string" ? (values[f.name] as string) : "";

    if (f.type === "toggle") {
      const on = toggles[f.name] ?? true;
      return (
        <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
          <div className={labelCls}>{f.label}</div>
          <div className="inline-flex rounded-lg bg-[var(--surface-sunken)] p-[3px]">
            {[true, false].map((val) => (
              <button
                key={String(val)}
                type="button"
                aria-pressed={on === val}
                onClick={() => setToggles((t) => ({ ...t, [f.name]: val }))}
                className={`h-9 cursor-pointer rounded-md px-4 text-[13px] ${
                  on === val
                    ? "bg-[var(--orange)] font-bold text-[var(--orange-ink)]"
                    : "font-semibold text-[var(--muted)]"
                }`}
              >
                {val ? "Yes" : "No"}
              </button>
            ))}
          </div>
          {f.hint ? <p className="mt-1.5 max-w-xs text-[11.5px] text-[var(--muted)]">{f.hint}</p> : null}
        </div>
      );
    }

    const listId = f.type === "combo" ? `${f.name}-combo` : undefined;
    const options = f.comboKey ? comboOptions[f.comboKey] ?? [] : [];

    const input =
      f.type === "select" ? (
        <select id={f.name} name={f.name} defaultValue={defaultValue} className={baseField}>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o === "" ? "—" : o}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={f.name}
            name={f.name}
            type={f.type === "date" ? "date" : f.mask ? "password" : "text"}
            inputMode={f.type === "number" ? "decimal" : undefined}
            defaultValue={defaultValue}
            placeholder={f.placeholder}
            {...(f.type === "date" ? { max: today } : {})}
            {...(f.maxLength ? { maxLength: f.maxLength } : {})}
            {...(listId ? { list: listId } : {})}
            autoComplete="off"
            className={`${baseField} ${f.type === "mono" || f.type === "number" || f.type === "combo" ? "ref" : ""}`}
          />
          {listId ? (
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ) : null}
        </>
      );

    return (
      <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
        <label className={labelCls} htmlFor={f.name}>
          {f.label}
        </label>
        {f.unit ? (
          <div className="flex items-center gap-2">
            {f.unit === "₹" ? <span className="shrink-0 text-[15px] text-[var(--muted)]">₹</span> : null}
            {input}
            {f.unit !== "₹" ? (
              <span className="shrink-0 text-sm text-[var(--muted)]">{f.unit}</span>
            ) : null}
          </div>
        ) : (
          input
        )}
        {errs?.length ? (
          <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{errs[0]}</p>
        ) : f.hint ? (
          <p className="mt-1 text-[11.5px] text-[var(--muted)]">{f.hint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => submit(e, false)} noValidate>
      {hideTitle ? null : (
        <>
          <h2 className="mb-0.5 text-lg font-bold">{section.title}</h2>
          <p className="mb-5 text-[13px] text-[var(--muted)]">{section.blurb}</p>
        </>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        {section.fields.map(renderField)}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="mt-4 text-[13px] font-semibold text-[var(--green-text)]">Saved.</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {nextKey ? (
          <button
            type="button"
            disabled={pending || blockAdvance}
            title={blockAdvance ? blockAdvanceReason : undefined}
            onClick={(e) =>
              submit(
                { preventDefault: () => {}, currentTarget: e.currentTarget.form } as unknown as FormEvent<HTMLFormElement>,
                true,
              )
            }
            className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save and continue
          </button>
        ) : null}
      </div>
      {blockAdvance && blockAdvanceReason ? (
        <p className="mt-2.5 text-[12.5px] text-[var(--amber-text)]">{blockAdvanceReason}</p>
      ) : null}
    </form>
  );
}
