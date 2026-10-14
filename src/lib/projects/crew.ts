import { and, arrayContains, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectInstallers, user } from "@/lib/db/schema";

/**
 * Who is on the crew.
 *
 * A job can have several installers, so every permission check that used to
 * compare one id now asks for the set. These two helpers are the only places
 * that read `project_installers` for a check — everything else passes the
 * result into `can` as `assignedInstallerIds`.
 */
export async function installerIdsFor(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ id: projectInstallers.installerId })
    .from(projectInstallers)
    .where(eq(projectInstallers.projectId, projectId));
  return rows.map((r) => r.id);
}

/** One round trip for a list of projects, keyed by project id. */
export async function installerIdsForMany(
  projectIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (projectIds.length === 0) return out;

  const rows = await db
    .select({ projectId: projectInstallers.projectId, id: projectInstallers.installerId })
    .from(projectInstallers)
    .where(inArray(projectInstallers.projectId, projectIds));

  for (const row of rows) {
    const list = out.get(row.projectId) ?? [];
    list.push(row.id);
    out.set(row.projectId, list);
  }
  return out;
}

export interface CrewMember {
  id: string;
  name: string;
  phone: string | null;
}

/** The crew with names, for display. */
export async function crewFor(projectId: string): Promise<CrewMember[]> {
  return db
    .select({ id: user.id, name: user.name, phone: user.phone })
    .from(projectInstallers)
    .innerJoin(user, eq(user.id, projectInstallers.installerId))
    .where(eq(projectInstallers.projectId, projectId))
    .orderBy(user.name);
}

/** Every installer an admin or employee may put on a job. Deactivated accounts are not offered. */
export async function availableInstallers(): Promise<CrewMember[]> {
  return db
    .select({ id: user.id, name: user.name, phone: user.phone })
    .from(user)
    .where(and(arrayContains(user.roles, ["INSTALLER"]), eq(user.active, true)))
    .orderBy(user.name);
}
