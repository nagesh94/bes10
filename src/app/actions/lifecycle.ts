"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, projects } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export type LifecycleResult = { ok: true } | { ok: false; error: string };

/**
 * Switches a project between prospect and customer by hand.
 *
 * Installation normally does this on its own; this is for the jobs where the
 * office knows better — a customer signed up before the crew went out, or a
 * project marked customer by mistake. A lead is not moved from here: it goes
 * through conversion, which asks for the portal ID.
 */
export async function setLifecycleStage(
  projectId: string,
  next: "PROSPECT" | "CUSTOMER",
): Promise<LifecycleResult> {
  const actor = await getActor();
  assertCan(actor, "project.write");

  if (next !== "PROSPECT" && next !== "CUSTOMER") {
    return { ok: false, error: "Unknown status." };
  }

  const [project] = await db
    .select({ lifecycleStage: projects.lifecycleStage })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };
  if (project.lifecycleStage === "LEAD") {
    return { ok: false, error: "Convert the lead first." };
  }
  if (project.lifecycleStage === next) return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ lifecycleStage: next, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "project.lifecycle",
      entityType: "project",
      entityId: projectId,
      projectId,
      before: { lifecycleStage: project.lifecycleStage },
      after: { lifecycleStage: next },
      reason: "Changed by hand",
    });
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}
