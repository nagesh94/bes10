import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, projects } from "@/lib/db/schema";
import { installerIdsFor } from "@/lib/projects/crew";
import { can, type Action } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * One job, loaded only if this actor is allowed to work on it.
 *
 * The assignment context is passed into `can`, which is what makes an
 * installer's `assigned` scope real: another crew's job returns null here and
 * the page is a 404, rather than rendering and relying on a hidden button.
 *
 * `projects` carries no monetary column — amounts live in their own tables —
 * so selecting the row whole still shows an installer no money.
 */
export async function loadJob(projectId: string, action: Action) {
  const actor = await getActor();
  if (!actor) return null;

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;

  const installerIds = await installerIdsFor(projectId);
  const allowed = can(actor, action, {
    assignedEmployeeId: row.project.assignedEmployeeId,
    assignedInstallerIds: installerIds,
  });
  if (!allowed) return null;

  return { actor, project: row.project, contact: row.contact, installerIds };
}

export function customerName(contact: { firstName: string; lastName: string | null }) {
  return `${contact.firstName} ${contact.lastName ?? ""}`.trim();
}
