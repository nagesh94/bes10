import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getPhotoThumbUrls } from "@/app/actions/photos";
import { PhotoGrid } from "@/components/documents/photo-grid";
import { BackLink, FieldSection, PageTitle } from "@/components/installer/job-chrome";
import { sectionByKey } from "@/components/prospect/fields";
import { SectionForm } from "@/components/prospect/section-form";
import { db } from "@/lib/db";
import { siteSurveys } from "@/lib/db/schema";
import { customerName, loadJob } from "@/lib/installer/job";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * The site survey, as an installer fills it.
 *
 * The same section definition and the same server action the office uses at
 * stage 1 — there is no second copy of these fields to drift out of step. The
 * only difference is the shell around it and the permission that lets an
 * installer in: `survey.write` on a job assigned to them.
 */
export default async function InstallerSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadJob(id, "survey.write");
  if (!job) notFound();

  const section = sectionByKey("survey");
  if (!section) notFound();

  const [survey] = await db.select().from(siteSurveys).where(eq(siteSurveys.projectId, id)).limit(1);
  const sitePhotos = await getPhotoThumbUrls(id, "SITE_SURVEY");

  return (
    <main className="mx-auto max-w-[640px] px-4 pt-2 pb-12">
      <BackLink href={`/installer/${id}`} label={customerName(job.contact)} />
      <PageTitle
        title="Site survey"
        sub="Estimated runs, measured on site in metres. Leave a field empty if it does not apply to this roof."
      />

      <div className="space-y-3">
        <FieldSection>
          <SectionForm
            projectId={id}
            section={section}
            values={{
              acCableLengthM: str(survey?.acCableLengthM),
              dcCableLengthM: str(survey?.dcCableLengthM),
              earthingLengthM: str(survey?.earthingLengthM),
              laLengthM: str(survey?.laLengthM),
              expectedWireLengthM: str(survey?.expectedWireLengthM),
              pipesRequired: str(survey?.pipesRequired),
            }}
            nextKey={null}
            hideTitle
          />
        </FieldSection>

        <FieldSection
          title="Survey photographs"
          blurb="The roof as you found it. Keep location switched on and the coordinates are burned into the corner of each shot."
        >
          <PhotoGrid
            projectId={id}
            photoType="SITE_SURVEY"
            label="Roof before installation"
            hint="Angles, shading, the meter board — whatever the quotation was based on"
            photos={sitePhotos}
          />
        </FieldSection>
      </div>
    </main>
  );
}
