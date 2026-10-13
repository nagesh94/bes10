"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { saveDiscomLinks } from "@/app/actions/admin-master";

const field =
  "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1 block text-xs font-semibold text-[var(--muted)]";

export function DiscomLinksForm({
  company,
}: {
  company: {
    id: number;
    nameChangeUrl: string | null;
    loadEnhancementUrl: string | null;
    meterPortalUrl: string | null;
    landRecordsUrl: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const data = new FormData(event.currentTarget);
    const result = await saveDiscomLinks({
      id: company.id,
      nameChangeUrl: String(data.get("nameChangeUrl") ?? ""),
      loadEnhancementUrl: String(data.get("loadEnhancementUrl") ?? ""),
      meterPortalUrl: String(data.get("meterPortalUrl") ?? ""),
      landRecordsUrl: String(data.get("landRecordsUrl") ?? ""),
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setSaved(true);
    setPending(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor={`name-change-${company.id}`}>Name-change portal</label>
        <input id={`name-change-${company.id}`} name="nameChangeUrl" defaultValue={company.nameChangeUrl ?? ""} className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`load-${company.id}`}>Load-enhancement portal</label>
        <input id={`load-${company.id}`} name="loadEnhancementUrl" defaultValue={company.loadEnhancementUrl ?? ""} className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`meter-${company.id}`}>Meter portal</label>
        <input id={`meter-${company.id}`} name="meterPortalUrl" defaultValue={company.meterPortalUrl ?? ""} className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`land-${company.id}`}>Land records</label>
        <input id={`land-${company.id}`} name="landRecordsUrl" defaultValue={company.landRecordsUrl ?? ""} className={field} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold text-[var(--ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save links"}
        </button>
        {saved ? <span className="text-[12.5px] font-semibold text-[var(--green-text)]">Saved</span> : null}
        {error ? <span className="text-[12.5px] font-medium text-[var(--red-text)]">{error}</span> : null}
      </div>
    </form>
  );
}
