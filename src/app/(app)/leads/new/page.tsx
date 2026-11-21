import { redirect } from "next/navigation";

/** Adding a lead is "Add project" on the projects list now. See ../page.tsx. */
export default function NewLeadPage() {
  redirect("/projects");
}
