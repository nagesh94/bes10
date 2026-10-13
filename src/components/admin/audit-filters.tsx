"use client";

import { useRouter } from "next/navigation";
import { type FormEvent } from "react";

export function AuditFilters({
  q,
  actor,
  type,
  people,
}: {
  q: string;
  actor: string;
  type: string;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();

  function push(form: HTMLFormElement) {
    const data = new FormData(form);
    const params = new URLSearchParams();
    const query = String(data.get("q") ?? "").trim();
    const who = String(data.get("actor") ?? "");
    const kind = String(data.get("type") ?? "all");
    if (query) params.set("q", query);
    if (who) params.set("actor", who);
    if (kind && kind !== "all") params.set("type", kind);
    const search = params.toString();
    router.push(search ? `/admin/audit?${search}` : "/admin/audit");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    push(event.currentTarget);
  }

  return (
    <form onSubmit={onSubmit} className="mb-[18px] flex flex-wrap gap-2.5">
      <label className="flex h-[42px] min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3">
        <span className="sr-only">Search the audit log</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-[var(--muted)]" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Project code, person or action"
          className="w-full border-0 bg-transparent text-[13.5px] text-[var(--ink)] outline-none"
        />
      </label>
      <select
        name="actor"
        aria-label="Filter by person"
        defaultValue={actor}
        onChange={(event) => push(event.currentTarget.form!)}
        className="h-[42px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-[11px] text-[13.5px] text-[var(--ink)]"
      >
        <option value="">Everyone</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>{person.name}</option>
        ))}
      </select>
      <select
        name="type"
        aria-label="Filter by type"
        defaultValue={type}
        onChange={(event) => push(event.currentTarget.form!)}
        className="h-[42px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-[11px] text-[13.5px] text-[var(--ink)]"
      >
        <option value="all">All activity</option>
        <option value="overrides">Overrides only</option>
        <option value="reads">Document reads</option>
      </select>
      <button
        type="submit"
        className="h-[42px] cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-semibold text-[var(--ink)]"
      >
        Search
      </button>
    </form>
  );
}
