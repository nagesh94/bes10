"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createQuotation, updateQuotation } from "@/app/actions/quotations";
import {
  arrayKw,
  capacityWord,
  defaultItems,
  SCOPE_ROWS,
  subjectLine,
  SYSTEM_TYPES,
  type ItemDraft,
  type MilestoneDraft,
  type SystemType,
} from "@/lib/quotations/content";
import type { MasterOptions, QuotationFormValues } from "@/lib/quotations/form-values";
import type { QuotationInput } from "@/lib/validation/quotation";

/**
 * The quotation maker.
 *
 * Laid out in the order the paper reads, because staff fill it with the
 * customer in front of them and a form that jumps about gets filled wrong.
 * The dropdowns seed the material rows but never lock them: every cell that
 * prints stays editable, which is the difference between this and a
 * template that has to be re-coded whenever a supplier changes.
 *
 * The subject line is echoed live under the capacity. It is the sentence the
 * customer reads first, and it is assembled from three separate fields, so
 * showing it is the cheapest way to catch "3KWP Off Grid" when On Grid was
 * meant.
 */

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[14.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const cell =
  "h-10 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";
const sectionBox =
  "mb-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5";

function Err({ name, errors }: { name: string; errors: Record<string, string[]> }) {
  const messages = errors[name];
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{messages[0]}</p>;
}

export function QuotationForm({
  mode,
  quotationId,
  number,
  initial,
  master,
  projectCode,
}: {
  mode: "create" | "edit";
  quotationId?: string;
  /** Shown on edit; on create the series decides it at save time. */
  number?: string;
  initial: QuotationFormValues;
  master: MasterOptions;
  projectCode?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<QuotationFormValues>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [scopeOpen, setScopeOpen] = useState(false);

  const set = <K extends keyof QuotationFormValues>(key: K, value: QuotationFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const capacity = Number(values.capacityKwp) || 0;
  const panelKw = arrayKw(Number(values.panelWattPeak) || null, Number(values.panelCount) || null);

  const panelCompanies = useMemo(
    () => Array.from(new Set(master.panels.map((p) => p.company))),
    [master.panels],
  );
  const modelsForCompany = useMemo(
    () => master.panels.filter((p) => p.company === values.panelCompany),
    [master.panels, values.panelCompany],
  );

  /**
   * Rebuild the material rows from what is now selected.
   *
   * Explicit rather than automatic: by the time someone changes the inverter
   * make they have usually reworded two remarks, and silently throwing that
   * away would be worse than an extra click.
   */
  function reseedItems() {
    set(
      "items",
      defaultItems(
        {
          structureMake: values.structureMake,
          panelCompany: values.panelCompany,
          panelModel: values.panelModel,
          panelWattPeak: Number(values.panelWattPeak) || null,
          panelCount: Number(values.panelCount) || null,
          inverterMake: values.inverterMake,
          systemType: values.systemType,
        },
        capacity,
      ),
    );
  }

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    set(
      "items",
      values.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    set(
      "milestones",
      values.milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    setErrors({});

    const payload = {
      projectId: values.projectId,
      consumerTitle: values.consumerTitle,
      consumerName: values.consumerName,
      consumerAddress: values.consumerAddress,
      consumerPhone: values.consumerPhone,
      quotationDate: values.quotationDate,
      capacityKwp: values.capacityKwp,
      systemType: values.systemType,
      meteringPolicy: values.meteringPolicy,
      totalAmount: values.totalAmount.replace(/[, ]/g, ""),
      structureMake: values.structureMake,
      panelCompany: values.panelCompany,
      panelModel: values.panelModel,
      panelWattPeak: values.panelWattPeak ? Number(values.panelWattPeak) : null,
      panelCount: values.panelCount ? Number(values.panelCount) : null,
      inverterMake: values.inverterMake,
      inverterModel: values.inverterModel,
      notes: values.notes,
      items: values.items,
      milestones: values.milestones,
      scope: values.scope,
    } as unknown as QuotationInput;

    const result =
      mode === "edit" && quotationId
        ? await updateQuotation(quotationId, payload)
        : await createQuotation(payload);

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      if (result.fieldErrors) setErrors(result.fieldErrors);
      return;
    }

    router.push(`/quotations/${result.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* ── Consumer ── */}
      <section className={sectionBox}>
        <div className="mb-4 flex flex-wrap items-baseline gap-2">
          <h2 className="flex-1 text-base font-bold">Consumer</h2>
          {projectCode ? (
            <span className="ref rounded-full bg-[var(--navy-soft)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--navy)]">
              {projectCode}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--muted)]">Not linked to a project</span>
          )}
          {number ? (
            <span className="ref rounded-full bg-[var(--orange-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--orange-text)]">
              {number}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-[110px_1fr_1fr]">
          <div>
            <label className={label} htmlFor="consumerTitle">
              Title
            </label>
            <select
              id="consumerTitle"
              className={field}
              value={values.consumerTitle}
              onChange={(e) =>
                set("consumerTitle", e.target.value as QuotationFormValues["consumerTitle"])
              }
            >
              <option value="">—</option>
              <option value="Mr.">Mr.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="M/s">M/s</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="consumerName">
              Consumer name
            </label>
            <input
              id="consumerName"
              className={field}
              value={values.consumerName}
              onChange={(e) => set("consumerName", e.target.value)}
            />
            <Err name="consumerName" errors={errors} />
          </div>
          <div>
            <label className={label} htmlFor="consumerPhone">
              Phone
            </label>
            <input
              id="consumerPhone"
              className={`${field} ref`}
              value={values.consumerPhone}
              onChange={(e) => set("consumerPhone", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={label} htmlFor="consumerAddress">
            Address
          </label>
          <input
            id="consumerAddress"
            className={field}
            value={values.consumerAddress}
            onChange={(e) => set("consumerAddress", e.target.value)}
          />
        </div>
      </section>

      {/* ── The offer ── */}
      <section className={sectionBox}>
        <h2 className="mb-4 text-base font-bold">The offer</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="quotationDate">
              Date
            </label>
            <input
              id="quotationDate"
              type="date"
              className={`${field} ref`}
              value={values.quotationDate}
              onChange={(e) => set("quotationDate", e.target.value)}
            />
            <Err name="quotationDate" errors={errors} />
          </div>

          <div>
            <label className={label} htmlFor="capacityKwp">
              Capacity (kWp)
            </label>
            <input
              id="capacityKwp"
              list="plant-sizes"
              inputMode="decimal"
              className={`${field} ref`}
              value={values.capacityKwp}
              onChange={(e) => set("capacityKwp", e.target.value)}
            />
            <datalist id="plant-sizes">
              {master.plantSizes.map((size) => (
                <option key={size.kw} value={size.kw}>
                  {size.label}
                </option>
              ))}
            </datalist>
            <Err name="capacityKwp" errors={errors} />
          </div>

          <div>
            <label className={label} htmlFor="systemType">
              System
            </label>
            <select
              id="systemType"
              className={field}
              value={values.systemType}
              onChange={(e) => set("systemType", e.target.value as SystemType)}
            >
              {SYSTEM_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="totalAmount">
              Total payable (Rs.)
            </label>
            <input
              id="totalAmount"
              inputMode="decimal"
              className={`${field} ref`}
              value={values.totalAmount}
              onChange={(e) => set("totalAmount", e.target.value)}
            />
            <Err name="totalAmount" errors={errors} />
          </div>
        </div>

        <div className="mt-4">
          <label className={label} htmlFor="meteringPolicy">
            Metering policy
          </label>
          <input
            id="meteringPolicy"
            className={field}
            value={values.meteringPolicy}
            onChange={(e) => set("meteringPolicy", e.target.value)}
          />
          <Err name="meteringPolicy" errors={errors} />
        </div>

        <p className="mt-4 rounded-lg bg-[var(--surface-2)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)]">Subject line: </span>
          {capacity > 0
            ? subjectLine(capacity, values.systemType, values.meteringPolicy)
            : "Enter a capacity to see the subject line the customer will read."}
        </p>
      </section>

      {/* ── Equipment ── */}
      <section className={sectionBox}>
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <h2 className="flex-1 text-base font-bold">Equipment</h2>
          <button
            type="button"
            onClick={reseedItems}
            className="h-9 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold text-[var(--navy)]"
          >
            Rebuild material rows
          </button>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
          These come from master data and only fill the table below. Rebuilding replaces every
          material row, so do it before you reword the remarks.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="structureMake">
              Structure
            </label>
            <select
              id="structureMake"
              className={field}
              value={values.structureMake}
              onChange={(e) => set("structureMake", e.target.value)}
            >
              <option value="">—</option>
              {master.structures.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="panelCompany">
              Panel make
            </label>
            <select
              id="panelCompany"
              className={field}
              value={values.panelCompany}
              onChange={(e) => {
                set("panelCompany", e.target.value);
                set("panelModel", "");
                set("panelWattPeak", "");
              }}
            >
              <option value="">—</option>
              {panelCompanies.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="panelModel">
              Panel model
            </label>
            <select
              id="panelModel"
              className={field}
              value={values.panelModel}
              disabled={!values.panelCompany}
              onChange={(e) => {
                const picked = modelsForCompany.find((p) => p.modelNo === e.target.value);
                set("panelModel", e.target.value);
                set("panelWattPeak", picked ? String(picked.wattPeak) : "");
              }}
            >
              <option value="">—</option>
              {modelsForCompany.map((panel) => (
                <option key={panel.modelNo} value={panel.modelNo}>
                  {panel.modelNo} · {panel.wattPeak} W
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="panelCount">
              Number of panels
            </label>
            <input
              id="panelCount"
              inputMode="numeric"
              className={`${field} ref`}
              value={values.panelCount}
              onChange={(e) => set("panelCount", e.target.value)}
            />
            {panelKw ? (
              <p className="mt-1 text-[11.5px] text-[var(--muted)]">
                {panelKw} kW of panel on a {capacity ? capacityWord(capacity) : "—"} sanction
              </p>
            ) : null}
          </div>

          <div className="lg:col-span-2">
            <label className={label} htmlFor="inverterMake">
              Inverter
            </label>
            <select
              id="inverterMake"
              className={field}
              value={values.inverterModel}
              onChange={(e) => {
                const picked = master.inverters.find((i) => i.modelNo === e.target.value);
                set("inverterModel", e.target.value);
                set("inverterMake", picked?.manufacturer ?? "");
              }}
            >
              <option value="">—</option>
              {master.inverters.map((inverter) => (
                <option key={inverter.modelNo} value={inverter.modelNo}>
                  {inverter.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Material description ── */}
      <section className={sectionBox}>
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <h2 className="flex-1 text-base font-bold">Material description</h2>
          <span className="ref text-[12px] text-[var(--muted)]">
            {values.items.length} {values.items.length === 1 ? "row" : "rows"}
          </span>
        </div>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          Prints as the Material Description table, in this order.
        </p>

        <div className="overflow-x-auto rounded-[9px] border border-[var(--line)]">
          <div className="grid min-w-[760px] grid-cols-[32px_1.5fr_0.7fr_1fr_1.8fr_40px] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
            <span />
            {["Item description", "Qty", "Make", "Remark"].map((h) => (
              <span
                key={h}
                className="text-[12px] font-semibold text-[var(--muted)]"
              >
                {h}
              </span>
            ))}
            <span />
          </div>

          {values.items.map((item, index) => (
            <div
              key={index}
              className="grid min-w-[760px] grid-cols-[32px_1.5fr_0.7fr_1fr_1.8fr_40px] items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2.5"
            >
              <span className="ref flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--chip-soft)] text-[11.5px] font-bold text-[var(--chip-text)]">
                {index + 1}
              </span>
              <input
                aria-label={`Item ${index + 1} description`}
                className={cell}
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
              />
              <input
                aria-label={`Item ${index + 1} quantity`}
                className={`${cell} ref`}
                value={item.qty}
                onChange={(e) => updateItem(index, { qty: e.target.value })}
              />
              <input
                aria-label={`Item ${index + 1} make`}
                className={cell}
                value={item.make}
                onChange={(e) => updateItem(index, { make: e.target.value })}
              />
              <input
                aria-label={`Item ${index + 1} remark`}
                className={cell}
                value={item.remark}
                onChange={(e) => updateItem(index, { remark: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  set(
                    "items",
                    values.items.filter((_, i) => i !== index),
                  )
                }
                className="h-8 w-8 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            set("items", [...values.items, { description: "", qty: "", make: "", remark: "" }])
          }
          className="mt-3 h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--navy)]"
        >
          Add a material row
        </button>
        <Err name="items" errors={errors} />
      </section>

      {/* ── Payment schedule ── */}
      <section className={sectionBox}>
        <h2 className="mb-1 text-base font-bold">Payment schedule</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          The schedule column prints exactly as typed — &ldquo;10%&rdquo; or a figure.
        </p>

        <div className="overflow-x-auto rounded-[9px] border border-[var(--line)]">
          <div className="grid min-w-[520px] grid-cols-[32px_2.4fr_1fr_40px] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
            <span />
            {["Details", "Price schedule"].map((h) => (
              <span
                key={h}
                className="text-[12px] font-semibold text-[var(--muted)]"
              >
                {h}
              </span>
            ))}
            <span />
          </div>

          {values.milestones.map((milestone, index) => (
            <div
              key={index}
              className="grid min-w-[520px] grid-cols-[32px_2.4fr_1fr_40px] items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2.5"
            >
              <span className="ref flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--chip-soft)] text-[11.5px] font-bold text-[var(--chip-text)]">
                {index + 1}
              </span>
              <input
                aria-label={`Payment ${index + 1} details`}
                className={cell}
                value={milestone.label}
                onChange={(e) => updateMilestone(index, { label: e.target.value })}
              />
              <input
                aria-label={`Payment ${index + 1} schedule`}
                className={`${cell} ref`}
                value={milestone.schedule}
                onChange={(e) => updateMilestone(index, { schedule: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove payment row ${index + 1}`}
                onClick={() =>
                  set(
                    "milestones",
                    values.milestones.filter((_, i) => i !== index),
                  )
                }
                className="h-8 w-8 cursor-pointer rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => set("milestones", [...values.milestones, { label: "", schedule: "" }])}
          className="mt-3 h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--navy)]"
        >
          Add a payment row
        </button>
        <Err name="milestones" errors={errors} />
      </section>

      {/* ── Project scope ── */}
      <section className={sectionBox}>
        <button
          type="button"
          aria-expanded={scopeOpen}
          onClick={() => setScopeOpen((open) => !open)}
          className="flex w-full cursor-pointer items-baseline gap-2 border-0 bg-transparent p-0 text-left"
        >
          <h2 className="flex-1 text-base font-bold">Project scope</h2>
          <span className="text-[12.5px] font-semibold text-[var(--link)]">
            {scopeOpen ? "Hide" : "Standard — change the ticks"}
          </span>
        </button>

        {scopeOpen ? (
          <div className="mt-4 overflow-x-auto rounded-[9px] border border-[var(--line)]">
            <div className="grid min-w-[520px] grid-cols-[1.2fr_2fr_72px_90px] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
              {["Section", "Details", "BHIM", "Customer"].map((h) => (
                <span
                  key={h}
                  className="text-[12px] font-semibold text-[var(--muted)]"
                >
                  {h}
                </span>
              ))}
            </div>

            {SCOPE_ROWS.map((row) => {
              const state = values.scope.find((s) => s.key === row.key) ?? {
                key: row.key,
                byBhim: row.byBhim,
                byCustomer: row.byCustomer,
              };
              const toggle = (patch: Partial<typeof state>) =>
                set(
                  "scope",
                  values.scope.map((s) => (s.key === row.key ? { ...s, ...patch } : s)),
                );

              return (
                <div
                  key={row.key}
                  className="grid min-w-[520px] grid-cols-[1.2fr_2fr_72px_90px] items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2.5"
                >
                  <span className="text-[13px] font-semibold">{row.section}</span>
                  <span className="text-[12.5px] text-[var(--muted)]">{row.details}</span>
                  <input
                    type="checkbox"
                    aria-label={`${row.section} by BHIM`}
                    checked={state.byBhim}
                    onChange={(e) => toggle({ byBhim: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
                  />
                  <input
                    type="checkbox"
                    aria-label={`${row.section} by customer`}
                    checked={state.byCustomer}
                    onChange={(e) => toggle({ byCustomer: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* ── Notes ── */}
      <section className={sectionBox}>
        <h2 className="mb-1 text-base font-bold">Extra summary line</h2>
        <p className="mb-3 text-[13px] text-[var(--muted)]">
          Optional. Prints as one more bullet under Project Summary — usually left empty.
        </p>
        <input
          aria-label="Extra summary line"
          className={field}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </section>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending
            ? "Generating…"
            : mode === "edit"
              ? "Save and rebuild the PDF"
              : "Generate quotation"}
        </button>
        <span className="text-[12.5px] text-[var(--muted)]">
          {mode === "edit"
            ? `${number} keeps its number — the customer may already have it.`
            : "The number is taken from the series when you save, and never reused. You'll land on the quotation to view or edit it."}
        </span>
      </div>
    </form>
  );
}
