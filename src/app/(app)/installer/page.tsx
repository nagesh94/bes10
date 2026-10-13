import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contacts,
  earthingRecords,
  installations,
  photos,
  projectInstallers,
  projects,
  rooftopDetails,
  siteSurveys,
} from "@/lib/db/schema";
import { InstallerFooter } from "@/components/shell/installer-header";
import { StatePill, type TaskState } from "@/components/installer/job-chrome";
import { getActor } from "@/lib/session";
import { REQUIRED_PHOTO_TYPES } from "@/lib/workflow/photo-requirements";

/**
 * An installer's own jobs, and nothing else.
 *
 * Scoped by the crew join in the query itself, not filtered after the fact —
 * a job somebody else is on is never in the response at all. No money appears
 * here, and there is no route out of this list into the pipeline: the only
 * links are the two forms an installer fills.
 */
export default async function InstallerPage() {
  const actor = await getActor();
  if (!actor) notFound();
  if (actor.role !== "INSTALLER" && actor.role !== "ADMIN") notFound();

  // The crew join is the scope: an installer's query only returns the jobs
  // they are on, so another crew's job is never in the response.
  const rows =
    actor.role === "INSTALLER"
      ? await db
          .select({ project: projects, contact: contacts, rooftop: rooftopDetails })
          .from(projectInstallers)
          .innerJoin(projects, eq(projects.id, projectInstallers.projectId))
          .innerJoin(contacts, eq(projects.contactId, contacts.id))
          .leftJoin(rooftopDetails, eq(rooftopDetails.projectId, projects.id))
          .where(eq(projectInstallers.installerId, actor.id))
          .orderBy(asc(projects.pipelineStage))
      : await db
          .select({ project: projects, contact: contacts, rooftop: rooftopDetails })
          .from(projects)
          .innerJoin(contacts, eq(projects.contactId, contacts.id))
          .leftJoin(rooftopDetails, eq(rooftopDetails.projectId, projects.id))
          .orderBy(asc(projects.pipelineStage))
          .limit(50);

  const ids = rows.map((r) => r.project.id);

  // Every lookup below is restricted to the jobs on screen.
  const [installs, photoRows, earthing, surveys] = ids.length
    ? await Promise.all([
        db.select().from(installations).where(inArray(installations.projectId, ids)),
        db.select().from(photos).where(inArray(photos.projectId, ids)),
        db.select().from(earthingRecords).where(inArray(earthingRecords.projectId, ids)),
        db.select().from(siteSurveys).where(inArray(siteSurveys.projectId, ids)),
      ])
    : [[], [], [], []];

  const installFor = new Map(installs.map((i) => [i.projectId, i]));
  const earthingFor = new Map(earthing.map((e) => [e.projectId, e]));
  const surveyFor = new Map(surveys.map((s) => [s.projectId, s]));

  const required = new Set<string>(REQUIRED_PHOTO_TYPES);
  const photoCover = new Map<string, Set<string>>();
  for (const p of photoRows) {
    if (!required.has(p.photoType)) continue;
    const set = photoCover.get(p.projectId) ?? new Set<string>();
    set.add(p.photoType);
    photoCover.set(p.projectId, set);
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 pt-4 pb-10">
      <h1 className="text-[21px] font-bold tracking-[-0.01em]">My jobs</h1>
      <p className="mt-1 mb-4 text-[13.5px] leading-relaxed text-[var(--muted)]">
        {actor.role === "ADMIN"
          ? "Every job, exactly as an installer sees it."
          : rows.length === 1
            ? "One job assigned to you."
            : rows.length > 1
              ? `${rows.length} jobs assigned to you.`
              : "Nothing on your list at the moment."}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-5 py-12 text-center">
          <p className="mb-1 text-[15px] font-semibold">Nothing assigned</p>
          <p className="text-[13.5px] text-[var(--muted)]">
            When a job is assigned to you it appears here.
          </p>
        </div>
      ) : (
        <ul className="list-none space-y-3 p-0">
          {rows.map((r) => {
            const install = installFor.get(r.project.id);
            const covered = photoCover.get(r.project.id)?.size ?? 0;
            const earth = earthingFor.get(r.project.id);
            const survey = surveyFor.get(r.project.id);

            const surveyState: TaskState = survey?.completedAt ? "done" : "todo";
            const installDone = Boolean(
              install?.installationDate && install.panelModelNo && install.inverterSerial,
            );
            const evidenceDone =
              covered >= REQUIRED_PHOTO_TYPES.length && Boolean(earth?.resistanceOhms);
            const postState: TaskState = installDone && evidenceDone ? "done" : installDone || covered ? "part" : "todo";

            return (
              <li key={r.project.id}>
                <Link
                  href={`/installer/${r.project.id}`}
                  className="block rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 no-underline"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[16px] font-bold text-[var(--ink)]">
                        {r.contact.firstName} {r.contact.lastName ?? ""}
                      </h2>
                      <p className="ref mt-0.5 text-[12px] text-[var(--muted)]">{r.project.code}</p>
                    </div>
                    {r.rooftop?.plantKw ? (
                      <span className="ref shrink-0 rounded-full bg-[var(--navy-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--link)]">
                        {r.rooftop.plantKw} kW
                      </span>
                    ) : null}
                    <span aria-hidden className="shrink-0 text-[18px] leading-none text-[var(--muted-soft)]">
                      ›
                    </span>
                  </div>

                  {r.contact.address ? (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
                      {r.contact.address}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatePill state={surveyState}>Survey</StatePill>
                    <StatePill state={postState}>
                      {postState === "done"
                        ? "Post-installation"
                        : `Post-installation · ${covered}/${REQUIRED_PHOTO_TYPES.length} photos`}
                    </StatePill>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {actor.role === "INSTALLER" ? <InstallerFooter /> : null}
    </main>
  );
}
