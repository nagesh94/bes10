"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setSupplierActive } from "@/app/actions/dcr";
import { EMPTY_SUPPLIER, SupplierForm } from "./supplier-form";

export interface SupplierRow {
  id: number;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  certificates: number;
}

/**
 * The supplier list with add and edit in place.
 *
 * Shown on the DCR page and under Master data. Anyone who may upload a
 * certificate may add a supplier; editing and retiring one is admin's.
 */
export function SupplierManager({
  rows,
  canAdd,
  canEdit,
}: {
  rows: SupplierRow[];
  canAdd: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const done = () => {
    setAdding(false);
    setEditing(null);
    router.refresh();
  };

  return (
    <div>
      {canAdd ? (
        <div className="mb-4">
          {adding ? (
            <SupplierForm initial={EMPTY_SUPPLIER} onSaved={done} onCancel={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="h-10 cursor-pointer rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)]"
            >
              + Add supplier
            </button>
          )}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center text-sm text-[var(--muted)]">
          No suppliers yet. They can also be added while uploading a certificate.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          {rows.map((s, i) => (
            <div key={s.id} className={i > 0 ? "border-t border-[var(--line-soft)]" : ""}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-56 flex-1">
                  <div className={`text-[13.5px] font-semibold ${s.active ? "" : "text-[var(--muted)] line-through"}`}>
                    {s.name}
                  </div>
                  <div className="ref mt-0.5 text-[12px] text-[var(--muted)]">
                    {[s.gstin && `GSTIN ${s.gstin}`, s.pan && `PAN ${s.pan}`].filter(Boolean).join(" · ") || "No GSTIN"}
                  </div>
                  {s.address || s.state ? (
                    <div className="mt-0.5 text-[12px] text-[var(--muted)]">
                      {[s.address, s.state, s.pincode].filter(Boolean).join(", ")}
                    </div>
                  ) : null}
                </div>
                <span className="text-[12.5px] text-[var(--muted)]">
                  {s.certificates} certificate{s.certificates === 1 ? "" : "s"}
                </span>
                {canEdit ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === s.id ? null : s.id)}
                      className="h-8 cursor-pointer rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-bold text-[var(--navy-text)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await setSupplierActive(s.id, !s.active);
                        router.refresh();
                      }}
                      className="h-8 cursor-pointer rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-bold text-[var(--muted)]"
                    >
                      {s.active ? "Retire" : "Restore"}
                    </button>
                  </div>
                ) : null}
              </div>
              {editing === s.id ? (
                <div className="px-5 pb-4">
                  <SupplierForm
                    id={s.id}
                    initial={{
                      name: s.name,
                      gstin: s.gstin ?? "",
                      pan: s.pan ?? "",
                      address: s.address ?? "",
                      state: s.state ?? "",
                      pincode: s.pincode ?? "",
                      phone: s.phone ?? "",
                      email: s.email ?? "",
                    }}
                    onSaved={done}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
