import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { DcrUpload } from "@/components/dcr/dcr-upload";

export default async function NewDcrPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "document.upload")) notFound();

  const rows = await db
    .select({ id: suppliers.id, name: suppliers.name, gstin: suppliers.gstin })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));

  return (
    <main className="mx-auto max-w-[880px] px-4 pt-7 pb-14 sm:px-6">
      <Link href="/dcr" className="mb-2 inline-block text-[13px] font-semibold no-underline">
        ← DCR certificates
      </Link>
      <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Upload a DCR certificate</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        The details are read from the PDF for you to check. Nothing is saved until you press Save.
      </p>
      <DcrUpload suppliers={rows} />
    </main>
  );
}
