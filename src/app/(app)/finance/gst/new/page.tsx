import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GstUpload } from "@/components/gst/gst-upload";
import { loadGstFormOptions } from "@/lib/gst/bills";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export const metadata: Metadata = { title: "Upload GST bill" };

export default async function NewGstBillPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "money.write")) notFound();

  const options = await loadGstFormOptions();

  return (
    <main className="mx-auto max-w-[1000px] px-4 pt-6 pb-14 sm:px-6">
      <Link href="/finance/gst" className="mb-2 inline-block text-[13px] font-semibold no-underline">
        ← GST bills
      </Link>
      <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Upload a GST bill</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        The details are read from the bill for you to check. Nothing is saved until you press Save.
      </p>
      <GstUpload suppliers={options.suppliers} projects={options.projects} />
    </main>
  );
}
