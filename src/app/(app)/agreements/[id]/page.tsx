import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agreementMilestones, agreements, projects } from "@/lib/db/schema";
import { attachableProjects } from "@/app/actions/agreements";
import { AgreementControls } from "@/components/agreements/agreement-actions";
import { AgreementForm } from "@/components/agreements/agreement-form";
import { LinkProject } from "@/components/agreements/link-project";
import { UseThisAgreement } from "@/components/agreements/use-this-agreement";
import type { AgreementFormValues, ValueSource } from "@/lib/agreements/form-values";
import { inr } from "@/lib/quotations/content";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * One agreement: what was agreed, and the form to change it.
 *
 * Editing rebuilds the .docx from the saved details. There is no delete —
 * a draft that came to nothing is marked Cancelled, which takes it off the
 * project's documents while leaving the record of what was drawn up.
 */
export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "agreement.read")) notFound();

  const [row] = await db
    .select({ agreement: agreements, projectCode: projects.code })
    .from(agreements)
    .leftJoin(projects, eq(agreements.projectId, projects.id))
    .where(eq(agreements.id, id))
    .limit(1);
  if (!row) notFound();

  const agreement = row.agreement;

  const milestones = await db
    .select()
    .from(agreementMilestones)
    .where(eq(agreementMilestones.agreementId, id))
    .orderBy(asc(agreementMilestones.sortOrder));

  const writable = can(actor, "agreement.write");

  // Offered for attaching a standalone agreement after the fact. Only
  // loaded for someone who may actually move it.
  const attachable = writable ? await attachableProjects() : [];

  const initial: AgreementFormValues = {
    projectId: agreement.projectId ?? "",
    consumerTitle: (agreement.consumerTitle ?? "") as AgreementFormValues["consumerTitle"],
    consumerName: agreement.consumerName,
    consumerAddress: agreement.consumerAddress,
    executionDate: agreement.executionDate,
    totalValue: String(Number(agreement.totalValue)),
    valueSource: (agreement.valueSource ?? "typed") as ValueSource,
    milestones: milestones.map((m) => ({ label: m.label, amount: String(Number(m.amount)) })),
  };

  const consumer = `${agreement.consumerTitle ?? ""} ${agreement.consumerName}`.trim();

  return (
    <main className="mx-auto max-w-[1100px] px-6 pt-7 pb-14">
      <div className="mb-5">
        <Link
          href="/agreements"
          className="mb-3 inline-block text-[13px] font-semibold text-[var(--link)] no-underline"
        >
          ← Agreements
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{consumer}</h1>
          {agreement.projectId && row.projectCode ? (
            <Link
              href={`/projects/${agreement.projectId}`}
              className="ref rounded-full bg-[var(--navy-soft)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--navy)] no-underline"
            >
              {row.projectCode}
            </Link>
          ) : null}
        </div>
        <p className="ref mt-1 text-sm text-[var(--muted)]">
          Rs. {inr(Number(agreement.totalValue))} · executed {agreement.executionDate}
          {agreement.docxGeneratedAt ? "" : " · no file built yet"}
        </p>
      </div>

      <div className="mb-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <AgreementControls
          id={agreement.id}
          status={agreement.status}
          hasFile={Boolean(agreement.s3Key)}
          canWrite={writable}
        />

        {agreement.projectId ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <UseThisAgreement
              id={agreement.id}
              primary={agreement.isPrimary}
              attached={writable}
              cancelled={agreement.status === "CANCELLED"}
            />
            <p className="min-w-60 flex-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
              {agreement.isPrimary
                ? `This is ${row.projectCode}’s agreement — filed into its documents and printed in the bank loan pack.`
                : `A draft on ${row.projectCode}. Another agreement is the one on file, so this is not filed or printed. Using this one swaps them; neither is deleted.`}
            </p>
          </div>
        ) : null}

        {writable ? (
          <div className="mt-4.5">
            <LinkProject
              id={agreement.id}
              projectId={agreement.projectId}
              projects={attachable}
            />
          </div>
        ) : null}
      </div>

      {writable ? (
        <AgreementForm
          mode="edit"
          agreementId={agreement.id}
          initial={initial}
          projectCode={row.projectCode}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">
          You can open this agreement but not change it.
        </p>
      )}
    </main>
  );
}
