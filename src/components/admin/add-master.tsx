"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addMaster, removeDiscomZone, setMasterActive } from "@/app/actions/admin-master";
import type { MasterCategory } from "@/lib/admin/catalog";

const field =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1 block text-xs font-semibold text-[var(--muted)]";

export function AddMaster({
  category,
  addLabel,
  companies,
  divisions,
}: {
  category: MasterCategory;
  addLabel: string;
  companies: { id: number; name: string }[];
  divisions: { id: number; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");

    const payload =
      category === "panel-companies" ||
      category === "panel-types" ||
      category === "structures" ||
      category === "cable-makes" ||
      category === "banks"
        ? { category, name: text("name") }
        : category === "panel-models"
          ? {
              category,
              companyId: text("companyId"),
              modelNo: text("modelNo"),
              wattPeak: text("wattPeak"),
              isDcr: data.get("isDcr") === "on",
            }
          : category === "inverters"
            ? {
                category,
                manufacturer: text("manufacturer"),
                brandName: text("brandName"),
                modelNo: text("modelNo"),
                capacityKw: text("capacityKw"),
              }
            : category === "plant-sizes"
              ? { category, kw: text("kw"), label: text("label") }
              : { category: "discom" as const, divisionId: text("divisionId"), name: text("name") };

    const result = await addMaster(payload);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setPending(false);
      return;
    }
    setOpen(false);
    setPending(false);
    router.refresh();
  }

  const blocked =
    (category === "panel-models" && companies.length === 0) ||
    (category === "discom" && divisions.length === 0);

  return (
    <>
      <button
        type="button"
        disabled={blocked}
        onClick={() => setOpen((v) => !v)}
        className="h-[38px] cursor-pointer rounded-lg bg-[var(--orange)] px-3.5 text-[13px] font-bold text-[var(--orange-ink)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {addLabel}
      </button>
      {open ? (
        <form onSubmit={onSubmit} className="mt-1 basis-full border-t border-[var(--line-soft)] pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {category === "panel-companies" ||
            category === "panel-types" ||
            category === "structures" ||
            category === "cable-makes" ||
            category === "banks" ? (
              <div className="sm:col-span-2">
                <label className={label} htmlFor="master-name">Name</label>
                <input id="master-name" name="name" required className={field} />
                <FieldError name="name" errors={fieldErrors} />
              </div>
            ) : null}

            {category === "panel-models" ? (
              <>
                <div>
                  <label className={label} htmlFor="master-company">Company</label>
                  <select id="master-company" name="companyId" required className={field} defaultValue="">
                    <option value="" disabled>Choose</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <FieldError name="companyId" errors={fieldErrors} />
                </div>
                <div>
                  <label className={label} htmlFor="master-model">Model number</label>
                  <input id="master-model" name="modelNo" required className={`${field} ref`} />
                  <FieldError name="modelNo" errors={fieldErrors} />
                </div>
                <div>
                  <label className={label} htmlFor="master-watt">Watt-peak</label>
                  <input id="master-watt" name="wattPeak" inputMode="numeric" required className={`${field} ref`} />
                  <FieldError name="wattPeak" errors={fieldErrors} />
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="isDcr" defaultChecked className="h-4 w-4 accent-[var(--orange)]" />
                  DCR
                </label>
              </>
            ) : null}

            {category === "inverters" ? (
              <>
                <div>
                  <label className={label} htmlFor="master-mfr">Manufacturer</label>
                  <input id="master-mfr" name="manufacturer" required className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="master-brand">Brand name</label>
                  <input id="master-brand" name="brandName" className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="master-imodel">Model number</label>
                  <input id="master-imodel" name="modelNo" required className={`${field} ref`} />
                </div>
                <div>
                  <label className={label} htmlFor="master-kw">Capacity (kW)</label>
                  <input id="master-kw" name="capacityKw" inputMode="decimal" required className={`${field} ref`} />
                  <FieldError name="capacityKw" errors={fieldErrors} />
                </div>
              </>
            ) : null}

            {category === "plant-sizes" ? (
              <>
                <div>
                  <label className={label} htmlFor="master-size">Size (kW)</label>
                  <input id="master-size" name="kw" inputMode="decimal" required className={`${field} ref`} />
                  <FieldError name="kw" errors={fieldErrors} />
                </div>
                <div>
                  <label className={label} htmlFor="master-label">Label</label>
                  <input id="master-label" name="label" placeholder="3 kW" className={field} />
                </div>
              </>
            ) : null}

            {category === "discom" ? (
              <>
                <div>
                  <label className={label} htmlFor="master-division">Division</label>
                  <select id="master-division" name="divisionId" required className={field} defaultValue="">
                    <option value="" disabled>Choose</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                  <FieldError name="divisionId" errors={fieldErrors} />
                </div>
                <div>
                  <label className={label} htmlFor="master-zone">Zone name</label>
                  <input id="master-zone" name="name" required className={field} />
                  <FieldError name="name" errors={fieldErrors} />
                </div>
              </>
            ) : null}
          </div>

          {blocked ? (
            <p className="mt-3 text-[12.5px] text-[var(--muted)]">
              {category === "panel-models" ? "Add a panel company first." : "Add a division before a zone."}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm font-medium text-[var(--red-text)]">{error}</p> : null}

          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-3.5 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 cursor-pointer rounded-lg border border-[var(--line)] px-3.5 text-[13px] font-semibold text-[var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function FieldError({ name, errors }: { name: string; errors: Record<string, string[]> }) {
  const messages = errors[name];
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{messages[0]}</p>;
}

export function RetireButton({
  category,
  id,
  active,
}: {
  category:
    | "panel-companies"
    | "panel-types"
    | "panel-models"
    | "inverters"
    | "structures"
    | "cable-makes"
    | "banks"
    | "plant-sizes";
  id: number;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await setMasterActive({ category, id, active: !active });
        setPending(false);
        router.refresh();
      }}
      className="cursor-pointer text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
    >
      {active ? "Retire" : "Restore"}
    </button>
  );
}

export function RemoveZoneButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await removeDiscomZone({ id });
        setPending(false);
        router.refresh();
      }}
      className="cursor-pointer text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
    >
      Remove
    </button>
  );
}
