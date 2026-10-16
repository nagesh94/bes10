import Link from "next/link";
import { notFound } from "next/navigation";
import { STAGE_BLURBS, STAGE_TITLES } from "@/lib/workflow/labels";
import { STAGE_KEYS } from "@/lib/workflow/stages";
import { loadProjectHeader } from "@/lib/projects/header";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { ProjectHeader } from "./project-header";
import { StageArrows, StagePager } from "./stage-pager";
import { StageStepper } from "./stage-stepper";

/**
 * One frame for every page of a project.
 *
 * Before this, each of the nine stages carried its own breadcrumb, its own
 * heading and its own idea of how wide a page should be, and the only way
 * between them was back out to the overview and in again. Now the frame is
 * declared once: the customer's name as the heading, the stepper under it,
 * and back/forth at the top and the foot of the work.
 *
 * A page that is not a stage — flags, the payment plan, the document
 * cabinet — passes `stageNo` as null and gets the same header with the
 * stepper showing where the job stands but no step marked as the one being
 * read.
 */
export async function StageShell({
  projectId,
  stageNo,
  title,
  note,
  badge,
  actions,
  width = "wide",
  children,
}: {
  projectId: string;
  stageNo: number | null;
  /** Overrides the stage's own title — for the pages that are not stages. */
  title?: string;
  note?: React.ReactNode;
  /** A status chip for the right of the title row. */
  badge?: React.ReactNode;
  /** Controls belonging to this page, e.g. "Generate the agreement". */
  actions?: React.ReactNode;
  width?: "wide" | "narrow";
  children: React.ReactNode;
}) {
  const [actor, data] = await Promise.all([getActor(), loadProjectHeader(projectId)]);
  if (!actor || !data) notFound();

  const key = stageNo ? STAGE_KEYS[stageNo - 1] : undefined;
  const heading = title ?? (key ? STAGE_TITLES[key] : "Project");
  const blurb = note ?? (key ? STAGE_BLURBS[key] : null);

  return (
    /* The frame is always full width — the header and the stepper want the
       room. `narrow` holds in the work itself, for the stages that are a
       single column of fields and would otherwise run to 1300px of line. */
    <main className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-16 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-[12.5px] text-[var(--muted)]">
        <Link href="/projects" className="no-underline">
          Projects
        </Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <Link href={`/projects/${projectId}`} className="ref no-underline">
          {data.code}
        </Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span>{stageNo ? `Stage ${stageNo}` : heading}</span>
      </nav>

      <ProjectHeader
        data={data}
        canSeeMoney={canSeeMoney(actor.roles)}
        canSeeDocuments={can(actor, "document.read")}
      />

      <section className="mt-3.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 pt-3 pb-2 sm:px-5">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
          <h2 className="text-[12px] font-bold tracking-[0.06em] text-[var(--muted)] uppercase">
            Pipeline
          </h2>
          <span className="ref text-[12px] text-[var(--muted)]">
            {data.completed.size} of {STAGE_KEYS.length} complete
          </span>
        </div>
        <StageStepper
          projectId={projectId}
          pipelineStage={data.pipelineStage}
          completed={[...data.completed]}
          activeStage={stageNo}
        />
      </section>

      <div className="mt-5 mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-60 flex-1">
          {stageNo ? (
            <div className="mb-0.5 text-[11.5px] font-bold tracking-[0.07em] text-[var(--orange-text)] uppercase">
              Stage {stageNo} of {STAGE_KEYS.length}
            </div>
          ) : null}
          <h2 className="text-[21px] leading-tight font-bold tracking-[-0.02em] sm:text-[23px]">
            {heading}
          </h2>
          {blurb ? (
            <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--muted)]">
              {blurb}
            </p>
          ) : null}
        </div>
        {badge ?? null}
        {actions ?? null}
        {stageNo ? <StageArrows projectId={projectId} stageNo={stageNo} /> : null}
      </div>

      <div className={width === "narrow" ? "max-w-[980px]" : undefined}>
        {children}

        {stageNo ? (
          <div className="mt-7 border-t border-[var(--line)] pt-5">
            <StagePager projectId={projectId} stageNo={stageNo} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
