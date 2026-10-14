import { redirect } from "next/navigation";
import { homeFor } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homeFor(actor.roles) : "/login");
}
