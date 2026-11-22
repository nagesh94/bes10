"use client";

import { useState } from "react";
import {
  createSupplier,
  updateSupplier,
  type SupplierInput,
  type SupplierOption,
} from "@/app/actions/dcr";

export const inputCls =
  "h-10 w-full rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
export const labelCls = "mb-1 block text-xs font-semibold text-[var(--muted)]";

export const EMPTY_SUPPLIER: Required<SupplierInput> = {
  name: "",
  gstin: "",
  pan: "",
  address: "",
  state: "",
  pincode: "",
  phone: "",
  email: "",
};

const FIELDS: { key: keyof SupplierInput; label: string; wide?: boolean; ref?: boolean }[] = [
  { key: "name", label: "Name *", wide: true },
  { key: "gstin", label: "GSTIN", ref: true },
  { key: "pan", label: "PAN", ref: true },
  { key: "address", label: "Address", wide: true },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pin code", ref: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
];

/**
 * Add or edit a supplier. Used inline on the certificate upload, prefilled
 * from what the certificate says, and on the suppliers list.
 */
export function SupplierForm({
  id,
  initial,
  onSaved,
  onCancel,
  submitLabel,
}: {
  id?: number;
  initial: SupplierInput;
  onSaved: (s: SupplierOption) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Required<SupplierInput>>({ ...EMPTY_SUPPLIER, ...initial } as Required<SupplierInput>);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function submit() {
    setPending(true);
    setError(null);
    setFieldErrors({});
    const r = id === undefined ? await createSupplier(values) : await updateSupplier(id, values);
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      return;
    }
    onSaved(r.supplier);
  }

  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <span className={labelCls}>{f.label}</span>
            <input
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={`${inputCls} ${f.ref ? "ref" : ""} ${fieldErrors[f.key] ? "border-[var(--red-text)]" : ""}`}
            />
            {fieldErrors[f.key] ? (
              <span className="mt-1 block text-[11.5px] text-[var(--red-text)]">{fieldErrors[f.key]![0]}</span>
            ) : null}
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="h-10 cursor-pointer rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : (submitLabel ?? (id === undefined ? "Add supplier" : "Save supplier"))}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
