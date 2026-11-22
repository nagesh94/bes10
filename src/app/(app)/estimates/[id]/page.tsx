import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Estimator } from "@/components/estimator/estimator";
import { loadEstimate, loadProjectOptions, loadRatesMap, readRates, sanitizeInputs } from "@/lib/estimator/data";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export const metadata: Metadata = { title: "Estimate" };

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const { id } = await params;
  const [row, rates, projects] = await Promise.all([loadEstimate(id), loadRatesMap(), loadProjectOptions()]);
  if (!row) notFound();
  const project = projects.find((p) => p.id === row.projectId);

  return (
    <main className="mx-auto max-w-[1360px] px-4 pt-5 pb-14 sm:px-6">
      <Link href="/estimates" className="text-[13px] font-semibold text-[var(--navy-text)] no-underline">
        ← Estimates
      </Link>
      <div className="mt-1.5 mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[25px] font-bold tracking-[-0.02em]">{row.name}</h1>
        <span className="ref text-[13px] font-bold text-[var(--navy-text)]">{row.number}</span>
        <span className="text-[13px] text-[var(--muted)]">
          updated {DAY.format(row.updatedAt)}
          {project ? (
            <>
              {" · "}
              <Link href={`/projects/${project.id}`} className="font-semibold text-[var(--navy-text)]">
                {project.label}
              </Link>
            </>
          ) : null}
        </span>
      </div>
      <Estimator
        key={row.updatedAt.toISOString()}
        id={row.id}
        number={row.number}
        initial={{
          name: row.name,
          phone: row.phone ?? "",
          projectId: row.projectId ?? "",
          notes: row.notes ?? "",
          inputs: sanitizeInputs(row.inputs),
        }}
        rates={readRates(row.rates) ?? rates}
        currentRates={rates}
        projects={projects}
        canWrite={can(actor, "money.write")}
      />
    </main>
  );
}
