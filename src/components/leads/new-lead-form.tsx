"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createLead } from "@/app/actions/leads";
import { leadSourceValues } from "@/lib/validation/lead";

const SOURCE_LABELS: Record<(typeof leadSourceValues)[number], string> = {
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  WEBSITE: "Website",
  CAMPAIGN: "Campaign",
  OTHER: "Other",
};

const field =
  "h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--orange)]";
const label = "mb-1.5 block text-xs font-semibold text-[var(--muted)]";

export function NewLeadForm({
  partners,
}: {
  partners: Array<{ id: string; name: string; phone: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [leadSource, setLeadSource] = useState<(typeof leadSourceValues)[number]>("WALK_IN");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const result = await createLead({
      firstName: String(data.get("firstName") ?? ""),
      lastName: String(data.get("lastName") ?? ""),
      phone: String(data.get("phone") ?? ""),
      email: String(data.get("email") ?? ""),
      address: String(data.get("address") ?? ""),
      pinCode: String(data.get("pinCode") ?? ""),
      interestedPlantKw: String(data.get("interestedPlantKw") ?? ""),
      leadSource: (data.get("leadSource") as (typeof leadSourceValues)[number]) ?? "WALK_IN",
      partnerId: String(data.get("partnerId") ?? ""),
      assignedEmployeeId: "",
    });

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setPending(false);
      return;
    }

    router.push(`/projects/${result.projectId}`);
    router.refresh();
  }

  function Err({ name }: { name: string }) {
    const messages = fieldErrors[name];
    if (!messages?.length) return null;
    return <p className="mt-1 text-xs font-medium text-[var(--red-text)]">{messages[0]}</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" className={field} required />
          <Err name="firstName" />
        </div>
        <div>
          <label className={label} htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" className={field} />
          <Err name="lastName" />
        </div>
        <div>
          <label className={label} htmlFor="phone">Phone number</label>
          <input id="phone" name="phone" inputMode="tel" className={`${field} ref`} required />
          <Err name="phone" />
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className={field} />
          <Err name="email" />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="address">Address</label>
          <input id="address" name="address" className={field} />
          <Err name="address" />
        </div>
        <div>
          <label className={label} htmlFor="pinCode">PIN code</label>
          <input id="pinCode" name="pinCode" inputMode="numeric" className={`${field} ref`} />
          <Err name="pinCode" />
        </div>
        <div>
          <label className={label} htmlFor="interestedPlantKw">Interested in</label>
          <input id="interestedPlantKw" name="interestedPlantKw" placeholder="3 kW" className={field} />
          <Err name="interestedPlantKw" />
        </div>
        <div>
          <label className={label} htmlFor="leadSource">Source</label>
          <select
            id="leadSource"
            name="leadSource"
            className={field}
            value={leadSource}
            onChange={(e) => setLeadSource(e.target.value as (typeof leadSourceValues)[number])}
          >
            {leadSourceValues.map((v) => (
              <option key={v} value={v}>{SOURCE_LABELS[v]}</option>
            ))}
          </select>
        </div>
        {leadSource === "REFERRAL" ? (
          <div>
            <label className={label} htmlFor="partnerId">Referred by</label>
            <select id="partnerId" name="partnerId" className={field} defaultValue="" required>
              <option value="" disabled>Select channel partner</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>
              ))}
            </select>
            <Err name="partnerId" />
            {partners.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                No active partners yet — add one from the Channel partners page.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--red-text)]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create lead"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/leads")}
          className="h-11 cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
