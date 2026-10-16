import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { ConvertPanel } from "@/components/projects/convert-panel";
import { CrewPanel } from "@/components/projects/crew-panel";
import { ProjectHeader } from "@/components/projects/project-header";
import { StageGate } from "@/components/projects/stage-gate";
import { StageStepper } from "@/components/projects/stage-stepper";
import { ProjectQuotations } from "@/components/quotations/project-quotations";
import { STAGE_BLURBS, STAGE_TITLES, gateLabel } from "@/lib/workflow/labels";
import { STAGE_KEYS, evaluateGate, stageByNo } from "@/lib/workflow/stages";
import { buildSnapshot } from "@/lib/workflow/snapshot";
import { availableInstallers, crewFor, installerIdsFor } from "@/lib/projects/crew";
import { loadProjectHeader } from "@/lib/projects/header";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * The project overview.
 *
 * Top to bottom in the order the office actually works: who this is, what
 * was quoted and who is going to site, where the job has got to, and what
 * is holding the current stage shut. The quotation and the crew sit above
 * the fold because they are what a customer rings about and what a morning
 * is planned around — they were in a right-hand column before, below the
 * stage checklist, which is the one place nobody looks first.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) notFound();

  const [[row], data] = await Promise.all([
    db.select({ project: projects }).from(projects).where(eq(projects.id, id)).limit(1),
    loadProjectHeader(id),
  ]);

  if (!row || !data) notFound();

  // Scope check: an installer only sees projects assigned to them.
  if (
    !can(actor, "project.read", {
      assignedEmployeeId: row.project.assignedEmployeeId,
      assignedInstallerIds: await installerIdsFor(id),
    })
  ) {
    notFound();
  }

  // Assigning the crew is pipeline work, so an employee does it as well as an
  // admin. The list of candidates is only loaded for someone who may assign.
  const canAssign = can(actor, "project.assign");
  const [crew, installers] = await Promise.all([
    crewFor(id),
    canAssign ? availableInstallers() : Promise.resolve([]),
  ]);

  const isLead = data.lifecycleStage === "LEAD";

  // The gate is evaluated here only to render the checklist; the server
  // re-evaluates from the database when the button is actually pressed.
  const currentStage = stageByNo(data.pipelineStage) ?? stageByNo(1)!;
  const snapshot = await buildSnapshot(id);
  const gate = evaluateGate(currentStage.no, snapshot);

  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-16 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-[12.5px] text-[var(--muted)]">
        <Link href="/projects" className="no-underline">
          Projects
        </Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span className="ref">{data.code}</span>
      </nav>

      <ProjectHeader
        data={data}
        canSeeMoney={canSeeMoney(actor.roles)}
        canSeeDocuments={can(actor, "document.read")}
      />

      {/* Quotation and crew, side by side and at the top: the two things
          asked about by telephone while the caller waits. */}
      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-2">
        {can(actor, "quotation.read") ? (
          <ProjectQuotations projectId={id} canWrite={can(actor, "quotation.write")} />
        ) : null}
        <CrewPanel
          projectId={id}
          crew={crew}
          installers={installers}
          canAssign={canAssign}
        />
      </div>

      {isLead ? (
        <div className="mt-3.5 flex flex-wrap items-start gap-3.5">
          <section className="min-w-80 flex-[999_1_480px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <h2 className="mb-1 text-base font-bold">Still a lead</h2>
            <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
              The pipeline opens once this becomes a prospect. Create the application on the PM
              Surya Ghar portal, then enter the ID alongside.
            </p>
          </section>
          <div className="min-w-72 flex-[1_1_320px]">
            <ConvertPanel projectId={id} />
          </div>
        </div>
      ) : (
        <>
          <section className="mt-3.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 pt-3 pb-2 sm:px-5">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <h2 className="flex-1 text-[12px] font-bold tracking-[0.06em] text-[var(--muted)] uppercase">
                Pipeline
              </h2>
              <span className="ref text-[12px] text-[var(--muted)]">
                {data.completed.size} of {STAGE_KEYS.length} complete
              </span>
            </div>
            <StageStepper
              projectId={id}
              pipelineStage={data.pipelineStage}
              completed={[...data.completed]}
            />
          </section>

          <div className="mt-3.5 flex flex-wrap items-start gap-3.5">
            <div className="min-w-80 flex-[999_1_520px]">
              <StageGate
                projectId={id}
                stageNo={currentStage.no}
                title={`Stage ${currentStage.no} · ${STAGE_TITLES[currentStage.key]}`}
                blurb={STAGE_BLURBS[currentStage.key]}
                items={gate.items.map((i) => ({
                  id: i.id,
                  label: gateLabel(i.id),
                  passed: i.passed,
                  detail: i.detail,
                }))}
                passed={gate.passed}
              />
            </div>

            <div className="min-w-72 flex-[1_1_300px] space-y-3.5">
              <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
                <h2 className="mb-1 text-[15px] font-bold">Carry on with the work</h2>
                <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--muted)]">
                  The pipeline above walks the nine stages in order, forwards or back. The stage
                  the job is on is stage {currentStage.no}.
                </p>
                <Link
                  href={`/projects/${id}/stage-${currentStage.no}`}
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
                >
                  Open stage {currentStage.no}
                </Link>
              </section>

              {data.openFlagCount > 0 ? (
                <section className="rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4.5">
                  <h2 className="mb-1 text-[15px] font-bold text-[var(--amber-text)]">
                    {data.openFlagCount} flag{data.openFlagCount > 1 ? "s" : ""} open
                  </h2>
                  <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--amber-body)]">
                    Stage 1 cannot close until they are resolved or waived.
                  </p>
                  <Link
                    href={`/projects/${id}/flags`}
                    className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
                  >
                    Resolve flags
                  </Link>
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
