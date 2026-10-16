import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  flags as flagsTable,
  projectStageProgress,
  projects,
  rooftopDetails,
} from "@/lib/db/schema";

/**
 * Everything the project header and the stage stepper need, in one load.
 *
 * Every page under /projects/[id] shows the same heading — the customer's
 * name, their project code, and where the job has got to — so the shape of
 * that heading is declared once here rather than re-assembled on each of
 * the twelve pages, which is how they drifted apart in the first place.
 */
export interface ProjectHeaderData {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  lifecycleStage: string;
  pipelineStage: number;
  completed: Set<number>;
  plantKw: string;
  portalId: string | null;
  divisionName: string | null;
  isDcr: boolean;
  openFlagCount: number;
}

export async function loadProjectHeader(id: string): Promise<ProjectHeaderData | null> {
  const [[row], progress, flagRows] = await Promise.all([
    db
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
      .limit(1),
    db.select().from(projectStageProgress).where(eq(projectStageProgress.projectId, id)),
    db.select({ status: flagsTable.status }).from(flagsTable).where(eq(flagsTable.projectId, id)),
  ]);

  if (!row) return null;

  const { project, contact, application, rooftop } = row;

  return {
    id: project.id,
    code: project.code,
    fullName: `${contact.firstName} ${contact.lastName ?? ""}`.trim(),
    phone: contact.phone,
    lifecycleStage: project.lifecycleStage,
    pipelineStage: project.pipelineStage,
    completed: new Set(
      progress.filter((p) => p.status === "complete").map((p) => p.stageNo),
    ),
    plantKw: rooftop?.plantKw ? `${rooftop.plantKw} kW` : project.interestedPlantKw || "—",
    portalId: application?.nationalPortalId ?? null,
    divisionName: application?.divisionName ?? null,
    isDcr: Boolean(application?.isDcr),
    openFlagCount: flagRows.filter(
      (f) => f.status === "OPEN" || f.status === "IN_PROGRESS",
    ).length,
  };
}
