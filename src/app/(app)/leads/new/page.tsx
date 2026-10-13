import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewLeadForm } from "@/components/leads/new-lead-form";
import { db } from "@/lib/db";
import { channelPartners } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export default async function NewLeadPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "lead.write")) redirect("/dashboard");

  const partners = await db
    .select({ id: channelPartners.id, name: channelPartners.name, phone: channelPartners.phone })
    .from(channelPartners)
    .where(eq(channelPartners.active, true))
    .orderBy(channelPartners.name);

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/leads" className="no-underline">Leads</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span>New</span>
      </nav>

      <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">New lead</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Just enough to call them back. The full prospect form comes after the application exists on
        the portal.
      </p>

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6">
        <NewLeadForm partners={partners} />
      </section>
    </main>
  );
}
