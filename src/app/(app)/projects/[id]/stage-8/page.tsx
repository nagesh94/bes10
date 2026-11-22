import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { InspectionDates } from "@/components/documents/generate-pack";
import { CommissioningSteps } from "@/components/projects/commissioning-steps";
import { db } from "@/lib/db";
import { contacts, externalRefs, projects } from "@/lib/db/schema";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

/**
 * Stage 8 — commissioning.
 *
 * No paperwork here any more: the office ticks "commissioning completed",
 * then "export started" once the net meter is exporting. After that the
 * project moves on to the subsidy at stage 9.
 */
export default async function Stage8Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, t] = await Promise.all([getActor(), getTranslations("stage")]);
  if (!actor || !can(actor, "document.generate")) notFound();

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  const [refs] = await db.select().from(externalRefs).where(eq(externalRefs.projectId, id)).limit(1);
  const meterRef = refs?.meterPaymentRef;
  const allDone = Boolean(refs?.commissioningCompletedAt && refs?.exportStartedAt);

  return (
    <StageShell projectId={id} stageNo={8} note={t("s8.note")}>
      {!meterRef ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <span className="min-w-60 flex-1">
            <strong className="block text-sm font-bold text-[var(--amber-text)]">
              {t("s8.noMeter")}
            </strong>
            <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
              {t("s8.noMeterBody")}
            </span>
          </span>
          <Link
            href={`/projects/${id}/stage-6`}
            className="inline-flex h-11 shrink-0 items-center rounded-lg border border-[var(--orange)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--orange-text)] no-underline"
          >
            {t("s8.goStage6")}
          </Link>
        </div>
      ) : null}

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <CommissioningSteps
          projectId={id}
          commissionedOn={day(refs?.commissioningCompletedAt)}
          exportStartedOn={day(refs?.exportStartedAt)}
        />
      </section>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <InspectionDates
          projectId={id}
          initial={{
            commissioningDate: day(refs?.commissioningDate),
            jointInspectionDate: day(refs?.jointInspectionDate),
            performanceCheckDate: day(refs?.performanceCheckDate),
          }}
        />
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/projects/${id}`}
          className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
        >
          {t("s2.backToGate")}
        </Link>
        {allDone && canSeeMoney(actor.roles) ? (
          <Link
            href={`/projects/${id}/stage-9`}
            className="inline-flex h-11 items-center rounded-lg border border-[var(--orange)] bg-[var(--surface)] px-4.5 text-sm font-bold text-[var(--orange-text)] no-underline"
          >
            {t("s8.next")}
          </Link>
        ) : null}
      </div>
    </StageShell>
  );
}
