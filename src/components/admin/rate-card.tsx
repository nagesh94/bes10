"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addSizedRate, saveCostRate } from "@/app/actions/costs";

const input =
  "ref h-9 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--orange)]";

/** A price for another inverter or structure size, e.g. 4 kW. */
export function AddSizedRate() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setPending(true);
        const result = await addSizedRate(
          String(data.get("base")),
          String(data.get("kw")),
          String(data.get("rate")),
        );
        setPending(false);
        if (!result.ok) return setMessage({ ok: false, text: result.error });
        setMessage({ ok: true, text: "Added." });
        form.reset();
        router.refresh();
      }}
      className="flex flex-wrap items-center gap-2.5 border-b border-[var(--line-soft)] bg-[var(--surface-2)] px-5 py-3"
    >
      <span className="text-[12.5px] font-semibold text-[var(--muted)]">Add a size</span>
      <select name="base" aria-label="Item" className={`${input} cursor-pointer`}>
        <option value="INVERTER">On-grid inverter</option>
        <option value="INVERTER_HYBRID">Hybrid inverter</option>
        <option value="INVERTER_OFF_GRID">Off-grid PCU</option>
        <option value="STRUCTURE">Mounting structure</option>
      </select>
      <label className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
        <input name="kw" required inputMode="decimal" placeholder="4" aria-label="Size in kW" className={`${input} w-16 text-right`} />
        kW at ₹
        <input name="rate" required inputMode="decimal" placeholder="21000" aria-label="Price" className={`${input} w-28 text-right`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-9 cursor-pointer rounded-lg bg-[var(--orange)] px-3 text-[12.5px] font-bold text-[var(--orange-ink)] disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {message ? (
        <span className={`text-[12px] font-medium ${message.ok ? "text-[var(--green-text)]" : "text-[var(--red-text)]"}`}>
          {message.text}
        </span>
      ) : null}
    </form>
  );
}

/**
 * One rate on the rate card, edited where it is read.
 *
 * Saving changes what new cost sheets propose. A sheet already saved on a
 * project keeps the rate it was saved with — a price rise must not quietly
 * rewrite last year's margins.
 */
export function RateCardRow({
  id,
  label,
  unit,
  rate,
}: {
  id: number;
  label: string;
  unit: string;
  rate: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(Number(rate)));
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const changed = Number(value) !== Number(rate);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const result = await saveCostRate(id, value);
        setPending(false);
        setState(result.ok ? "saved" : result.error);
        if (result.ok) router.refresh();
      }}
      className="flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-5 py-[11px]"
    >
      <div className="min-w-0 flex-[1_1_180px] text-sm font-semibold">{label}</div>
      <label className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
        ₹
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          aria-label={`${label} rate`}
          className="ref h-9 w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-right text-sm text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        />
        <span className="w-14">per {unit}</span>
      </label>
      <button
        type="submit"
        disabled={pending || !changed}
        className="h-9 cursor-pointer rounded-lg bg-[var(--orange)] px-3 text-[12.5px] font-bold text-[var(--orange-ink)] disabled:cursor-default disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state === "saved" ? (
        <span className="text-[12px] font-semibold text-[var(--green-text)]">Saved</span>
      ) : state !== "idle" ? (
        <span className="text-[12px] font-medium text-[var(--red-text)]">{state}</span>
      ) : null}
    </form>
  );
}
