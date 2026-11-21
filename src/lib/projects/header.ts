import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  electricityConnections,
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
  /**
   * The electricity consumer number, which is how the DISCOM, the portal and
   * the customer themselves all refer to the connection. It sits in the
   * header beside the portal ID because those two numbers are what every
   * telephone call about a job opens with.
   */
  consumerNumber: string | null;
  divisionName: string | null;
  isDcr: boolean;
  openFlagCount: number;
  /**
   * The open flags themselves, not just how many. The header chip shows them
   * on hover so the common question — "what is blocking this one?" — is
   * answered without loading the flags page. There are only ever two kinds,
   * so this list stays short by construction.
   */
  openFlags: Array<{ type: string; status: string }>;
}

/** Open and in-progress both block the job; resolved and waived do not. */
function isOpen(status: string): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export async function loadProjectHeader(id: string): Promise<ProjectHeaderData | null> {
  const [[row], progress, flagRows] = await Promise.all([
    db
      .select({
        project: projects,
        contact: contacts,
        application: applicationDetails,
        rooftop: rooftopDetails,
        connection: electricityConnections,
      })
      .from(projects)
      .innerJoin(contacts, eq(projects.contactId, contacts.id))
      .leftJoin(applicationDetails, eq(applicationDetails.projectId, projects.id))
      .leftJoin(rooftopDetails, eq(rooftopDetails.projectId, projects.id))
      .leftJoin(electricityConnections, eq(electricityConnections.projectId, projects.id))
      .where(eq(projects.id, id))
      .limit(1),
    db.select().from(projectStageProgress).where(eq(projectStageProgress.projectId, id)),
    db
      .select({ type: flagsTable.type, status: flagsTable.status })
      .from(flagsTable)
      .where(eq(flagsTable.projectId, id)),
  ]);

  if (!row) return null;

  const { project, contact, application, rooftop, connection } = row;
  const openFlags = flagRows.filter((f) => isOpen(f.status));

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
    consumerNumber: connection?.consumerNumber ?? null,
    divisionName: application?.divisionName ?? null,
    isDcr: Boolean(application?.isDcr),
    openFlagCount: openFlags.length,
    openFlags,
  };
}
