import { redirect } from "next/navigation";

/**
 * Leads used to be a list of its own.
 *
 * It no longer is. A lead is a project at the lead stage, not a separate
 * kind of record, and the projects list already holds every one of them —
 * with the lifecycle filter to narrow to leads and the same form behind
 * "Add project". Two lists over one table only ever meant two places to
 * look for the same job.
 *
 * The route is kept as a redirect rather than deleted so the bookmarks and
 * pasted links already in circulation land on the list that replaced it.
 */
export default function LeadsPage() {
  redirect("/projects?lifecycle=LEAD");
}
