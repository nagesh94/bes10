import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  projectStageProgress,
  projects,
  rooftopDetails,
} from "@/lib/db/schema";
import { ConvertPanel } from "@/components/projects/convert-panel";
import { CrewPanel } from "@/components/projects/crew-panel";
import { ProjectNav } from "@/components/projects/project-nav";
import { StageGate } from "@/components/projects/stage-gate";
import { StageRail } from "@/components/projects/stage-rail";
import { ProjectQuotations } from "@/components/quotations/project-quotations";
import { flags as flagsTable } from "@/lib/db/schema";
import { STAGE_BLURBS, STAGE_TITLES, gateLabel } from "@/lib/workflow/labels";
import { evaluateGate, stageByNo } from "@/lib/workflow/stages";
import { buildSnapshot } from "@/lib/workflow/snapshot";
import { availableInstallers, crewFor, installerIdsFor } from "@/lib/projects/crew";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

const LIFECYCLE_CHIP: Record<string, string> = {
  LEAD: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  PROSPECT: "bg-[var(--navy-soft)] text-[var(--navy)]",
  CUSTOMER: "bg-[var(--green-soft)] text-[var(--green-text)]",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) notFound();

  const [row] = await db
    .select({
      project: projects,
      contact: contacts,
      application: applicationDetails,
      rooftop: rooftopDetails,
    })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(applicationDetails, eq(applicationDetails.projectId, projects.id))
    .leftJoin(rooftopDetails, eq(rooftopDetails.projectId, projects.id))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) notFound();

  // Scope check: an installer only sees projects assigned to them.
  if (
    !can(actor, "project.read", {
      assignedEmployeeId: row.project.assignedEmployeeId,
      assignedInstallerIds: await installerIdsFor(id),
    })
  ) {
    notFound();
  }

  const progress = await db
    .select()
    .from(projectStageProgress)
    .where(eq(projectStageProgress.projectId, id));

  // Assigning the crew is pipeline work, so an employee does it as well as an
  // admin. The list of candidates is only loaded for someone who may assign.
  const canAssign = can(actor, "project.assign");
  const [crew, installers] = await Promise.all([
    crewFor(id),
    canAssign ? availableInstallers() : Promise.resolve([]),
  ]);

  const completed = new Set(
    progress.filter((p) => p.status === "complete").map((p) => p.stageNo),
  );

  const { project, contact, application, rooftop } = row;
  const isLead = project.lifecycleStage === "LEAD";

  // The gate is evaluated here only to render the checklist; the server
  // re-evaluates from the database when the button is actually pressed.
  const currentStage = stageByNo(project.pipelineStage) ?? stageByNo(1)!;
  const snapshot = await buildSnapshot(id);
  const gate = evaluateGate(currentStage.no, snapshot);
  const openFlagCount = (
    await db.select().from(flagsTable).where(eq(flagsTable.projectId, id))
  ).filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;

  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();

  const meta: Array<{ k: string; v: string; mono?: boolean }> = [
    { k: "Plant size", v: rooftop?.plantKw ? `${rooftop.plantKw} kW` : project.interestedPlantKw || "—" },
    { k: "Portal ID", v: application?.nationalPortalId ?? "—", mono: true },
    { k: "Phone", v: contact.phone, mono: true },
    { k: "Division", v: application?.divisionName ?? "—" },
  ];

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/leads" className="no-underline">Leads</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span className="ref">{project.code}</span>
      </nav>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <span className="ref text-[13px] font-medium text-[var(--muted)]">{project.code}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] uppercase ${
              LIFECYCLE_CHIP[project.lifecycleStage] ?? ""
            }`}
          >
            {project.lifecycleStage}
          </span>
          {application?.isDcr ? (
            <span className="rounded bg-[var(--green-soft)] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-[var(--green-text)] uppercase">
              DCR
            </span>
          ) : null}
        </div>

        <h1 className="mb-2.5 text-[26px] font-bold tracking-[-0.02em]">{fullName}</h1>

        <div className="flex flex-wrap gap-x-7 gap-y-2">
          {meta.map((m) => (
            <div key={m.k}>
              <div className="text-[12px] font-semibold text-[var(--muted)]">
                {m.k}
              </div>
              <div className={`mt-0.5 text-sm font-semibold ${m.mono ? "ref" : ""}`}>{m.v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <div className="mb-4 flex flex-wrap items-baseline gap-2">
          <h2 className="flex-1 text-[15px] font-bold">
            Project stage
          </h2>
          <span className="text-[13px] text-[var(--muted)]">
            {completed.size} of 9 complete
          </span>
        </div>
        <StageRail currentStage={project.pipelineStage} completed={completed} />
      </section>

      <div className="flex flex-wrap items-start gap-4.5">
        <div className="min-w-0 flex-[999_1_520px]">
          {isLead ? (
            <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
              <h2 className="mb-1 text-base font-bold">Still a lead</h2>
              <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
                Stage 1 opens once this becomes a prospect. Create the application on the PM Surya
                Ghar portal, then enter the ID on the right.
              </p>
            </section>
          ) : (
            <>
              <StageGate
                projectId={project.id}
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

              {currentStage.no === 1 ? (
                <div className="mt-4.5 flex flex-wrap gap-2.5">
                  <Link
                    href={`/projects/${project.id}/stage-1`}
                    className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4.5 text-sm font-semibold text-[var(--ink)] no-underline"
                  >
                    Open the prospect form
                  </Link>
                  {openFlagCount > 0 ? (
                    <Link
                      href={`/projects/${project.id}/flags`}
                      className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
                    >
                      Resolve {openFlagCount} flag{openFlagCount > 1 ? "s" : ""}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="min-w-72 flex-[1_1_320px] space-y-4.5">
          {isLead ? (
            <ConvertPanel projectId={project.id} />
          ) : (
            <ProjectNav
              projectId={project.id}
              currentStage={project.pipelineStage}
              completed={completed}
              canSeeMoney={canSeeMoney(actor.role)}
              canSeeDocuments={can(actor, "document.read")}
              openFlagCount={openFlagCount}
              sectionsComplete={snapshot.prospectSectionsComplete}
              planLocked={snapshot.paymentPlanLocked}
            />
          )}

          {can(actor, "quotation.read") ? (
            <ProjectQuotations
              projectId={project.id}
              canWrite={can(actor, "quotation.write")}
            />
          ) : null}

          <CrewPanel
            projectId={project.id}
            crew={crew}
            installers={installers}
            canAssign={canAssign}
          />
        </div>
      </div>
    </main>
  );
}
