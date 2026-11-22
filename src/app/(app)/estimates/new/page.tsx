import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Estimator } from "@/components/estimator/estimator";
import { DEFAULT_INPUTS } from "@/lib/estimator/engine";
import { loadProjectOptions, loadRatesMap } from "@/lib/estimator/data";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export const metadata: Metadata = { title: "New estimate" };

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const { project } = await searchParams;
  const [rates, projects] = await Promise.all([loadRatesMap(), loadProjectOptions()]);
  const attached = projects.find((p) => p.id === project);

  return (
    <main className="mx-auto max-w-[1360px] px-4 pt-5 pb-14 sm:px-6">
      <Link href="/estimates" className="text-[13px] font-semibold text-[var(--navy-text)] no-underline">
        ← Estimates
      </Link>
      <h1 className="mt-1.5 mb-1 text-[25px] font-bold tracking-[-0.02em]">New estimate</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Price a system before installation — on-grid, hybrid or off-grid — and arrive at the figure to quote.
      </p>
      <Estimator
        id={null}
        number={null}
        initial={{
          name: attached?.name ?? "",
          phone: attached?.phone ?? "",
          projectId: attached?.id ?? "",
          notes: "",
          inputs: DEFAULT_INPUTS,
        }}
        rates={rates}
        projects={projects}
        canWrite={can(actor, "money.write")}
      />
    </main>
  );
}
