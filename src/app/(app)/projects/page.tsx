import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, electricityConnections, projects, rooftopDetails } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { STAGES } from "@/lib/workflow/stages";
import { STAGE_TITLES } from "@/lib/workflow/labels";

/**
 * Every project, searchable.
 *
 * The dashboard groups by stage, which answers "what needs doing today". This
 * answers the other question — "where is the Nagde job" — and is the page you
 * reach for when somebody phones.
 *
 * No money appears here, so it is open to employees as well as admins.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; lifecycle?: string }>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "project.read")) notFound();
  if (actor.role === "PARTNER" || actor.role === "INSTALLER") notFound();

  const { q = "", stage = "", lifecycle = "" } = await searchParams;

  const rows = await db
    .select({
      project: projects,
      contact: contacts,
      rooftop: rooftopDetails,
      connection: electricityConnections,
    })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(rooftopDetails, eq(rooftopDetails.projectId, projects.id))
    .leftJoin(electricityConnections, eq(electricityConnections.projectId, projects.id))
    .orderBy(desc(projects.updatedAt))
    .limit(500);

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (stage && String(r.project.pipelineStage) !== stage) return false;
    if (lifecycle && r.project.lifecycleStage !== lifecycle) return false;
    if (!needle) return true;
    return [
      r.project.code,
      `${r.contact.firstName} ${r.contact.lastName ?? ""}`,
      r.contact.phone,
      r.contact.address ?? "",
      r.connection?.consumerNumber ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const href = (next: { q?: string; stage?: string; lifecycle?: string }) => {
    const params = new URLSearchParams();
    const query = next.q ?? q;
    const s = next.stage ?? stage;
    const l = next.lifecycle ?? lifecycle;
    if (query) params.set("q", query);
    if (s) params.set("stage", s);
    if (l) params.set("lifecycle", l);
    const str = params.toString();
    return str ? `/projects?${str}` : "/projects";
  };

  const perStage = new Map<number, number>();
  for (const r of rows) {
    perStage.set(r.project.pipelineStage, (perStage.get(r.project.pipelineStage) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <div className="mb-5">
        <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Projects</h1>
        <p className="text-sm text-[var(--muted)]">
          {rows.length} in all. Search by name, phone, project code, address or consumer number.
        </p>
      </div>

      <form action="/projects" className="mb-4 flex flex-wrap gap-2.5">
        {stage ? <input type="hidden" name="stage" value={stage} /> : null}
        {lifecycle ? <input type="hidden" name="lifecycle" value={lifecycle} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Krishni, 98269…, BHIM-2026-0007, N2317015620"
          aria-label="Search projects"
          className="h-11 min-w-60 flex-1 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        />
        <button
          type="submit"
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)]"
        >
          Search
        </button>
        {q || stage || lifecycle ? (
          <Link
            href="/projects"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-bold text-[var(--navy)] no-underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={href({ stage: "" })}
          aria-current={stage === "" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] no-underline ${
            stage === ""
              ? "bg-[var(--navy)] font-bold text-[var(--navy-ink)]"
              : "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--muted)]"
          }`}
        >
          All stages
          <span className="ref text-[11px] opacity-75">{rows.length}</span>
        </Link>
        {STAGES.map((s) => {
          const n = perStage.get(s.no) ?? 0;
          const active = stage === String(s.no);
          return (
            <Link
              key={s.no}
              href={href({ stage: String(s.no) })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] no-underline ${
                active
                  ? "bg-[var(--navy)] font-bold text-[var(--navy-ink)]"
                  : "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--muted)]"
              } ${n === 0 && !active ? "opacity-55" : ""}`}
            >
              <span className="ref">{s.no}</span>
              {STAGE_TITLES[s.key]}
              <span className="ref text-[11px] opacity-75">{n}</span>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-12 text-center">
          <p className="mb-1 text-[15px] font-semibold">Nothing matches</p>
          <p className="text-[13.5px] text-[var(--muted)]">
            {needle ? `No project matches "${q}".` : "No project in this stage."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          {filtered.map((r, i) => (
            <Link
              key={r.project.id}
              href={`/projects/${r.project.id}`}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 no-underline ${
                i < filtered.length - 1 ? "border-b border-[var(--line-soft)]" : ""
              }`}
            >
              <span
                className={`ref flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold ${
                  r.project.lifecycleStage === "LEAD"
                    ? "bg-[var(--chip-soft)] text-[var(--muted)]"
                    : "bg-[var(--orange-soft)] text-[var(--orange-text)]"
                }`}
              >
                {r.project.pipelineStage}
              </span>

              <span className="min-w-44 flex-[2_1_220px]">
                <span className="block text-[14px] font-semibold text-[var(--ink)]">
                  {r.contact.firstName} {r.contact.lastName ?? ""}
                </span>
                <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
                  {r.project.code} · {r.contact.phone}
                </span>
              </span>

              <span className="min-w-32 flex-1 text-[12.5px] text-[var(--muted)]">
                {r.rooftop?.plantKw ? (
                  <span className="ref font-semibold text-[var(--ink)]">
                    {r.rooftop.plantKw} kW
                  </span>
                ) : (
                  <span className="text-[var(--muted-soft)]">size not set</span>
                )}
                {r.connection?.consumerNumber ? (
                  <span className="ref mt-0.5 block text-[11px]">
                    {r.connection.consumerNumber}
                  </span>
                ) : null}
              </span>

              <span className="min-w-28 shrink-0 text-[12.5px] text-[var(--muted)]">
                {STAGE_TITLES[STAGES[r.project.pipelineStage - 1]?.key ?? "onboarding"]}
              </span>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                  r.project.lifecycleStage === "LEAD"
                    ? "bg-[var(--chip-soft)] text-[var(--muted)]"
                    : r.project.lifecycleStage === "CUSTOMER"
                      ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                      : "bg-[var(--navy-soft)] text-[var(--navy)]"
                }`}
              >
                {r.project.lifecycleStage}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
