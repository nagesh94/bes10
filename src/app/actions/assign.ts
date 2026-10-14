"use server";

import { and, arrayContains, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, projectInstallers, projects, user } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export type AssignResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Sets the whole crew on a job in one call.
 *
 * Admin and employee both do this — assigning work is pipeline work, not an
 * admin-only control. The call replaces the crew rather than adding to it, so
 * the form posts the full list and removals need no second action.
 *
 * Only accounts that are actually active installers are written: an id typed
 * into the request by hand cannot put an employee on a crew and hand them an
 * installer's access.
 */
export async function setProjectCrew(
  projectId: string,
  installerIds: string[],
): Promise<AssignResult> {
  const actor = await getActor();
  assertCan(actor, "project.assign");

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };

  const wanted = [...new Set(installerIds.filter(Boolean))];

  const valid = wanted.length
    ? await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            inArray(user.id, wanted),
            arrayContains(user.roles, ["INSTALLER"]),
            eq(user.active, true),
          ),
        )
    : [];
  const validIds = valid.map((v) => v.id);

  if (validIds.length !== wanted.length) {
    return { ok: false, error: "One of those accounts is not an active installer." };
  }

  const before = await db
    .select({ id: projectInstallers.installerId })
    .from(projectInstallers)
    .where(eq(projectInstallers.projectId, projectId));

  await db.transaction(async (tx) => {
    await tx.delete(projectInstallers).where(eq(projectInstallers.projectId, projectId));
    if (validIds.length) {
      await tx.insert(projectInstallers).values(
        validIds.map((installerId) => ({ projectId, installerId, assignedBy: actor.id })),
      );
    }
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "project.assign.installers",
      entityType: "project",
      entityId: projectId,
      projectId,
      before: { installerIds: before.map((b) => b.id) },
      after: { installerIds: validIds },
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/installer");
  return { ok: true, count: validIds.length };
}
