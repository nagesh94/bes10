import { notFound } from "next/navigation";
import { canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/** Every figure in the estimator is a cost or a price: admin only. */
export default async function EstimatesLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  return <>{children}</>;
}
