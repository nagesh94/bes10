import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";

/** Each role has its own home. An installer's is their job list. */
function homeFor(role: "ADMIN" | "EMPLOYEE" | "INSTALLER" | "PARTNER") {
  if (role === "INSTALLER") return "/installer";
  if (role === "PARTNER") return "/my-referrals";
  return "/dashboard";
}

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homeFor(actor.role) : "/login");
}
