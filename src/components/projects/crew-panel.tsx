"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setProjectCrew } from "@/app/actions/assign";
import type { CrewMember } from "@/lib/projects/crew";

/**
 * Who is going to site.
 *
 * Several installers can be on one job — two crews on a big roof, or a second
 * pair of hands for the earthing — so this is a list of toggles and not a
 * single picker. Everyone ticked here gets the job on their phone and can
 * fill the survey and the post-installation form; nobody else can.
 */
export function CrewPanel({
  projectId,
  crew,
  installers,
  canAssign,
}: {
  projectId: string;
  crew: CrewMember[];
  installers: CrewMember[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() => crew.map((c) => c.id));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = new Set(crew.map((c) => c.id));
  const dirty =
    selected.length !== initial.size || selected.some((id) => !initial.has(id));

  function toggle(id: string) {
    setSaved(false);
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await setProjectCrew(projectId, selected);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (!canAssign) {
    return (
      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-3 text-[15px] font-bold">
          Installers
        </h2>
        {crew.length === 0 ? (
          <p className="text-[13.5px] text-[var(--muted)]">Nobody assigned yet.</p>
        ) : (
          <ul className="list-none space-y-1.5 p-0">
            {crew.map((c) => (
              <li key={c.id} className="text-sm font-semibold">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h2 className="flex-1 text-[15px] font-bold">
          Installers
        </h2>
        <span className="ref text-[12px] text-[var(--muted)]">
          {selected.length} on the crew
        </span>
      </div>
      <p className="mb-3.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
        Everyone ticked gets this job on their phone, with the site survey and the
        post-installation form. More than one is fine.
      </p>

      {installers.length === 0 ? (
        <p className="text-[13.5px] text-[var(--muted)]">
          No installer accounts yet. An admin creates them under Admin → Users.
        </p>
      ) : (
        <ul className="list-none space-y-1.5 p-0">
          {installers.map((person) => {
            const on = selected.includes(person.id);
            return (
              <li key={person.id}>
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                    on
                      ? "border-[var(--orange)] bg-[var(--orange-soft)]"
                      : "border-[var(--line)] bg-[var(--surface-2)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(person.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--orange)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{person.name}</span>
                    {person.phone ? (
                      <span className="ref block text-[11.5px] text-[var(--muted)]">
                        {person.phone}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-[var(--red-border)] bg-[var(--red-surface)] px-3 py-2 text-[12.5px] font-medium text-[var(--red-text)]"
        >
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="mt-3 text-[12.5px] font-semibold text-[var(--green-text)]">
          Crew saved.
        </p>
      ) : null}

      {installers.length > 0 ? (
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="mt-3.5 h-11 w-full cursor-pointer rounded-lg bg-[var(--orange)] text-sm font-bold text-[var(--orange-ink)] disabled:cursor-default disabled:opacity-50"
        >
          {pending ? "Saving…" : dirty ? "Save the crew" : "Saved"}
        </button>
      ) : null}
    </section>
  );
}
