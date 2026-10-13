import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  earthingRecords,
  installations,
  photos,
  rooftopDetails,
  siteSurveys,
} from "@/lib/db/schema";
import { BackLink, TaskCard, type TaskState } from "@/components/installer/job-chrome";
import { customerName, loadJob } from "@/lib/installer/job";
import { REQUIRED_PHOTO_TYPES } from "@/lib/workflow/photo-requirements";

/**
 * One job. Two things to fill in, in the order they happen on site.
 *
 * Reached only by the people assigned to it — `loadJob` passes the assignment
 * into the permission check, so an unassigned installer gets a 404 and not a
 * disabled screen.
 */
export default async function InstallerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadJob(id, "project.read");
  if (!job) notFound();

  const [rooftop, survey, install, earthing, photoRows] = await Promise.all([
    db.select().from(rooftopDetails).where(eq(rooftopDetails.projectId, id)).limit(1),
    db.select().from(siteSurveys).where(eq(siteSurveys.projectId, id)).limit(1),
    db.select().from(installations).where(eq(installations.projectId, id)).limit(1),
    db.select().from(earthingRecords).where(eq(earthingRecords.projectId, id)).limit(1),
    db.select().from(photos).where(eq(photos.projectId, id)),
  ]);

  const required = new Set<string>(REQUIRED_PHOTO_TYPES);
  const covered = new Set(photoRows.filter((p) => required.has(p.photoType)).map((p) => p.photoType))
    .size;

  const surveyRow = survey[0];
  const installRow = install[0];
  const earthRow = earthing[0];

  const surveyState: TaskState = surveyRow?.completedAt
    ? "done"
    : surveyRow
      ? "part"
      : "todo";

  const installDone = Boolean(
    installRow?.installationDate && installRow.panelModelNo && installRow.inverterSerial,
  );
  const evidenceDone = covered >= REQUIRED_PHOTO_TYPES.length && Boolean(earthRow?.resistanceOhms);
  const postState: TaskState =
    installDone && evidenceDone ? "done" : installRow || covered ? "part" : "todo";

  const name = customerName(job.contact);

  return (
    <main className="mx-auto max-w-[640px] px-4 pt-2 pb-10">
      <BackLink href="/installer" label="My jobs" />

      <section className="mb-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] leading-tight font-bold tracking-[-0.01em]">{name}</h1>
            <p className="ref mt-1 text-[12px] text-[var(--muted)]">{job.project.code}</p>
          </div>
          {rooftop[0]?.plantKw ? (
            <span className="ref shrink-0 rounded-full bg-[var(--navy-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--link)]">
              {rooftop[0].plantKw} kW
            </span>
          ) : null}
        </div>

        {job.contact.address ? (
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
            {job.contact.address}
            {job.contact.pinCode ? ` — ${job.contact.pinCode}` : ""}
          </p>
        ) : null}

        <div className="mt-3.5 flex gap-2.5">
          <a
            href={`tel:${job.contact.phone}`}
            className="ref inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-[var(--orange)] px-4 text-[14px] font-bold text-[var(--orange-ink)] no-underline"
          >
            Call {job.contact.phone}
          </a>
          {job.contact.address ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${job.contact.address} ${job.contact.pinCode ?? ""}`.trim(),
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[14px] font-semibold text-[var(--ink)] no-underline"
            >
              Map
            </a>
          ) : null}
        </div>
      </section>

      <div className="space-y-3">
        <TaskCard
          href={`/installer/${id}/survey`}
          step="1"
          title="Site survey"
          blurb="The runs you measured on the roof before the work starts — cable, earthing, LA and pipes."
          state={surveyState}
          status={
            surveyState === "done" ? "Filled in" : surveyState === "part" ? "Started" : "Not started"
          }
        />
        <TaskCard
          href={`/installer/${id}/installation`}
          step="2"
          title="Post-installation details"
          blurb="What actually went on the roof, the panel serials, the six photographs, material used and the earth resistance."
          state={postState}
          status={
            postState === "done"
              ? "Filled in"
              : `${installDone ? "Equipment saved" : "Equipment pending"} · ${covered}/${
                  REQUIRED_PHOTO_TYPES.length
                } photos`
          }
        />
      </div>
    </main>
  );
}
