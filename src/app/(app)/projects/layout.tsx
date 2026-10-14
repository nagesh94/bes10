import { redirect } from "next/navigation";
import { isOnly } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * The pipeline is closed to installers.
 *
 * Their field work lives at /installer, with its own shell and only the two
 * forms they fill. Without this, an installer who was ever sent a stage-3
 * link would land in the office view of a project — breadcrumbs into the
 * pipeline, the stage gate, other stages' uploads. One redirect here covers
 * every route under /projects, including the nine stage pages.
 */
export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (isOnly(actor, "INSTALLER")) redirect("/installer");
  return children;
}
