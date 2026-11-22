import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asc, eq } from "drizzle-orm";
import { getPhotoThumbUrls } from "@/app/actions/photos";
import { PhotoGrid } from "@/components/documents/photo-grid";
import { EarthingForm, MaterialForm } from "@/components/installation/material-form";
import { db } from "@/lib/db";
import {
  cableMakes,
  contacts,
  earthingRecords,
  installations,
  materialConsumption,
  projects,
  siteSurveys,
} from "@/lib/db/schema";
import { installerIdsFor } from "@/lib/projects/crew";
import { can } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";
import { REQUIRED_PHOTO_TYPES } from "@/lib/workflow/photo-requirements";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function Stage4Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, t, tl] = await Promise.all([getActor(), getTranslations("stage"), getTranslations("labels")]);
  if (!actor) notFound();

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  // Installers reach their own jobs only. Anybody assigned can add evidence —
  // that was the explicit ask: whoever is on the roof uploads the photos.
  if (
    !can(actor, "evidence.write", {
      assignedEmployeeId: row.project.assignedEmployeeId,
      assignedInstallerIds: await installerIdsFor(id),
    })
  ) {
    notFound();
  }

  const material = await db
    .select()
    .from(materialConsumption)
    .where(eq(materialConsumption.projectId, id))
    .orderBy(asc(materialConsumption.sortOrder));

  const [earthing] = await db
    .select()
    .from(earthingRecords)
    .where(eq(earthingRecords.projectId, id))
    .limit(1);

  const [install] = await db
    .select({ pipesUsed: installations.pipesUsed })
    .from(installations)
    .where(eq(installations.projectId, id))
    .limit(1);

  const [survey] = await db
    .select({ pipesRequired: siteSurveys.pipesRequired })
    .from(siteSurveys)
    .where(eq(siteSurveys.projectId, id))
    .limit(1);

  const cableMakeRows = await db
    .select({ name: cableMakes.name })
    .from(cableMakes)
    .where(eq(cableMakes.active, true))
    .orderBy(asc(cableMakes.name));

  // One round trip per grid, in parallel.
  const galleries = await Promise.all(
    REQUIRED_PHOTO_TYPES.map(async (type) => ({
      type,
      photos: await getPhotoThumbUrls(id, type),
    })),
  );

  const covered = galleries.filter((g) => g.photos.length > 0).length;

  return (
    <StageShell
      projectId={id}
      stageNo={4}
      note={t("s4.note")}
      badge={
        <span
          className={`ref shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
            covered >= REQUIRED_PHOTO_TYPES.length
              ? "bg-[var(--green-soft)] text-[var(--green-text)]"
              : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
          }`}
        >
          {t("s4.shots", { done: covered, total: REQUIRED_PHOTO_TYPES.length })}
        </span>
      }
    >

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-0.5 text-base font-bold">{t("s4.requiredPhotos")}</h2>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          {t("s4.distinctShots", { count: REQUIRED_PHOTO_TYPES.length })}
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-4">
          {galleries.map(({ type, photos }) => (
            <div
              key={type}
              className={`rounded-[9px] border p-3.5 ${
                photos.length
                  ? "border-[var(--line)] bg-[var(--surface-2)]"
                  : "border-[var(--amber-border)] bg-[var(--amber-surface)]"
              }`}
            >
              <PhotoGrid
                projectId={id}
                photoType={type}
                label={tl(`photos.${type}.label`)}
                hint={tl(`photos.${type}.hint`)}
                photos={photos}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-4.5">
        <section className="min-w-80 flex-[1_1_520px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <MaterialForm
            projectId={id}
            initial={material.map((m) => ({
              category: m.category,
              make: str(m.make),
              lengthM: str(m.lengthM),
              sizeSqmm: str(m.sizeSqmm),
              coreType: str(m.coreType),
              conductor: str(m.conductor),
            }))}
            initialPipesUsed={str(install?.pipesUsed)}
            pipesRequired={survey?.pipesRequired ?? null}
            cableMakeOptions={cableMakeRows.map((r) => r.name)}
          />
        </section>

        <section className="min-w-80 flex-[1_1_360px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <EarthingForm
            projectId={id}
            initial={{
              resistanceOhms: str(earthing?.resistanceOhms),
              wireSize: str(earthing?.wireSize),
              wireType: str(earthing?.wireType),
              twoSeparatePoints: earthing?.twoSeparatePoints ?? false,
              cautionSignage: earthing?.cautionSignage ?? false,
              omManualProvided: earthing?.omManualProvided ?? false,
            }}
          />
        </section>
      </div>

      <Link
        href={`/projects/${id}`}
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
      >
        {t("s2.backToGate")}
      </Link>
    </StageShell>
  );
}
