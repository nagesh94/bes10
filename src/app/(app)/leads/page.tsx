import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, projects } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Leads still being worked.
 *
 * A lead that has been converted is a prospect, and a prospect's home is the
 * pipeline — the lead columns say nothing useful about it any more and it
 * only pads the list the office works down. The row is the same row either
 * way, so nothing is lost: /projects shows every lifecycle stage.
 */

const LEAD_STATUS_CHIP: Record<string, string> = {
  NEW: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  CONTACTED: "bg-[var(--navy-soft)] text-[var(--navy)]",
  SURVEY_DONE: "bg-[var(--navy-soft)] text-[var(--navy)]",
  READY_TO_CONVERT: "bg-[var(--green-soft)] text-[var(--green-text)]",
  LOST: "bg-[var(--chip-soft)] text-[var(--muted)]",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SURVEY_DONE: "Survey done",
  READY_TO_CONVERT: "Ready to convert",
  LOST: "Lost",
};

const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  WEBSITE: "Website",
  CAMPAIGN: "Campaign",
  OTHER: "Other",
};

export default async function LeadsPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "lead.read")) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 py-10">
        <p className="text-sm text-[var(--muted)]">You do not have access to leads.</p>
      </main>
    );
  }

  // Filtered in the query, not after it: a converted lead must not reach this
  // page at all, and the limit should be 100 open leads rather than 100 rows
  // of which some number happen to still be leads.
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      leadStatus: projects.leadStatus,
      leadSource: projects.leadSource,
      interestedPlantKw: projects.interestedPlantKw,
      createdAt: projects.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      pinCode: contacts.pinCode,
      address: contacts.address,
    })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.lifecycleStage, "LEAD"))
    .orderBy(desc(projects.createdAt))
    .limit(100);

  const open = rows.filter((r) => r.leadStatus !== "LOST").length;

  // Only to tell the two empty states apart: a brand-new install, where the
  // first lead is still to be created, from an office that has converted
  // everything it has.
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(projects);

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-7 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Leads</h1>
          <p className="text-sm text-[var(--muted)]">
            {open} open{rows.length > open ? ` · ${rows.length - open} lost` : ""} · converted
            leads move to{" "}
            <Link href="/projects" className="font-semibold text-[var(--navy)] no-underline">
              Projects
            </Link>
          </p>
        </div>
        <Link
          href="/leads/new"
          className="flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
        >
          New lead
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center">
          <p className="mb-1 font-semibold">{total === 0 ? "No leads yet" : "No open leads"}</p>
          <p className="mb-5 text-sm text-[var(--muted)]">
            {total === 0 ? (
              <>The first one you create becomes BHIM-{new Date().getFullYear()}-0001.</>
            ) : (
              <>
                Every lead has been converted or lost. Converted ones are in{" "}
                <Link href="/projects" className="font-semibold text-[var(--navy)] no-underline">
                  Projects
                </Link>
                , under their own project code.
              </>
            )}
          </p>
          <Link
            href="/leads/new"
            className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            {total === 0 ? "Create the first lead" : "Create a lead"}
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {["Project", "Name", "Location", "Interest", "Source", "Status"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--line)] px-5 py-2.5 text-left text-[12px] font-semibold text-[var(--muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--line-soft)]">
                    <td className="px-5 py-3.5 align-middle">
                      <Link href={`/projects/${r.id}`} className="ref text-[13px] font-medium no-underline">
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="text-sm font-semibold">
                        {r.firstName} {r.lastName ?? ""}
                      </div>
                      <div className="ref mt-0.5 text-[11.5px] text-[var(--muted)]">{r.phone}</div>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[13.5px] text-[var(--muted)]">
                      {r.address ?? "—"}
                      {r.pinCode ? <span className="ref"> · {r.pinCode}</span> : null}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[13.5px] whitespace-nowrap">
                      {r.interestedPlantKw || "—"}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[13.5px] text-[var(--muted)]">
                      {SOURCE_LABELS[r.leadSource ?? "OTHER"] ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                          LEAD_STATUS_CHIP[r.leadStatus] ?? ""
                        }`}
                      >
                        {LEAD_STATUS_LABELS[r.leadStatus] ?? r.leadStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
