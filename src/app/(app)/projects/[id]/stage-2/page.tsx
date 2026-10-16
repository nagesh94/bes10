import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bankAccounts,
  contacts,
  documents as documentsTable,
  paymentPlans,
  projects,
} from "@/lib/db/schema";
import { UploadSlot } from "@/components/documents/upload-slot";
import { AgreementStep } from "@/components/agreements/agreement-step";
import { BankFile } from "@/components/documents/bank-file";
import { QuotationStep } from "@/components/quotations/quotation-step";
import { can, hasRole } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";
import { involvesFinance } from "@/lib/workflow/stages";

interface Step {
  n: number;
  title: string;
  body: string;
  docType?: string;
  label?: string;
  hint?: string;
  pending?: boolean;
}

export default async function Stage2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "document.upload")) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  const docRows = await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const docFor = (type: string, where: (d: (typeof docRows)[number]) => boolean = () => true) => {
    const match = docRows
      .filter((d) => d.docType === type && where(d))
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
    return match
      ? {
          id: match.id,
          fileName: match.fileName,
          sizeBytes: match.sizeBytes,
          uploadedAt: match.uploadedAt,
          hasPortal: Boolean(match.s3KeyPortal),
        }
      : null;
  };

  // Mode and lock state are workflow facts, not amounts — safe for any role.
  const [plan] = await db
    .select({ mode: paymentPlans.mode, lockedAt: paymentPlans.lockedAt })
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, id))
    .limit(1);
  const financed = involvesFinance(plan?.mode ?? null);
  const planLocked = Boolean(plan?.lockedAt);

  // Whether there is a co-applicant changes what the bank file contains.
  const [bank] = await db
    .select({ hasCoApplicant: bankAccounts.hasCoApplicant })
    .from(bankAccounts)
    .where(eq(bankAccounts.projectId, id))
    .limit(1);
  const hasCoApplicant = Boolean(bank?.hasCoApplicant);
  const isAdmin = hasRole(actor, "ADMIN");
  // A quotation states a price, so the maker only appears for a role allowed
  // to see one. Everyone else still gets the upload slot.
  const canQuote = can(actor, "quotation.read");

  // The upload slot under the quotation maker is for one priced elsewhere, so
  // it must not display the PDF the maker just filed — otherwise "Replace"
  // appears to offer overwriting a generated document, which it does not.
  // The step's tick still counts either kind: the project has a quotation.
  const uploadedQuotation = docFor("QUOTATION", (d) => d.docClass !== "GENERATED");
  // Same rule for the agreement, now that it is made by its own maker
  // rather than by a button on this page.
  const uploadedAgreement = docFor("AGREEMENT", (d) => d.docClass !== "GENERATED");
  // An agreement states the price in clause 19.1, so the maker only appears
  // for a role allowed to see one. Everyone else still gets the upload slot.
  const canAgree = can(actor, "agreement.read");

  const steps: Step[] = [
    {
      n: 1,
      title: "Make the quotation",
      body: "Built from this project's own details and filed here, so the agreement and the customer are talking about the same number.",
      docType: "QUOTATION",
      label: "Or upload a quotation priced elsewhere",
      hint: "Photo or PDF — only if you are not using the one made here",
    },
    {
      n: 2,
      title: "Upload the customer signature",
      body: "A clean specimen on white paper, photographed or scanned.",
      docType: "CUSTOMER_SIGNATURE",
      label: "Customer signature",
      hint: "Image is best — it gets composited into the generated documents",
    },
    {
      n: 3,
      title: "Generate the agreement",
      body: "Produces the Annexure 2 model agreement as an editable Word file, with the parties and clause 19.1 filled from this project. Download it, give it to the lawyer for the hard copy, then upload the signed scan at step 4.",
      docType: "AGREEMENT",
      label: "Vendor agreement",
    },
    {
      n: 4,
      title: "Upload the signed scan",
      body: "Scan the wet-signed copy and put it back here. It is stored alongside the original, never in place of it.",
      docType: "AGREEMENT_SIGNED",
      label: "Vendor agreement — signed scan",
      hint: "Keep it at full resolution for the bank pack",
    },
  ];
  return (
    <StageShell
      projectId={id}
      stageNo={2}
      note={
        <>
          The agreement is signed on paper, so
          the app produces it and takes the scan back.
          {financed ? "" : " This is a cash project, so there is no sanction letter."}
        </>
      }
    >
      {!planLocked ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <span className="min-w-60 flex-1">
            <strong className="block text-sm font-bold text-[var(--amber-text)]">
              The payment plan is not locked yet
            </strong>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--amber-body)]">
              The agreement can still be drawn up — clause 19.1 is filled from the accepted
              quotation instead, and can be typed over. But until the negotiation is settled
              and the plan is locked in stage 1, what is signed here and what the office is
              owed can drift apart.
              {isAdmin ? "" : " An admin settles this."}
            </span>
          </span>
          {isAdmin ? (
            <Link
              href={`/projects/${id}/payments`}
              className="inline-flex h-11 shrink-0 items-center rounded-lg bg-[var(--orange)] px-4.5 text-[13.5px] font-bold text-[var(--orange-ink)] no-underline"
            >
              Settle the payment plan
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 pt-2 pb-6">
        {steps.map((step, i) => {
          const existing = step.docType ? docFor(step.docType) : null;
          const done = step.docType ? Boolean(existing) : false;
          return (
            <div
              key={step.n}
              className={`flex gap-4 py-5 ${i < steps.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}
            >
              <div className="flex shrink-0 flex-col items-center">
                <span
                  className={`ref flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-bold ${
                    done
                      ? "bg-[var(--green)] text-white"
                      : "bg-[var(--orange)] text-[var(--orange-ink)]"
                  }`}
                >
                  {done ? "✓" : step.n}
                </span>
                {i < steps.length - 1 ? (
                  <span className="mt-2 w-0.5 flex-1 rounded-sm bg-[var(--line)]" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-bold">{step.title}</h2>
                  {step.pending ? (
                    <span className="rounded-full bg-[var(--amber-soft)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.05em] text-[var(--amber-text)] uppercase">
                      Engine in phase 4
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 text-[13.5px] leading-relaxed text-[var(--muted)]">{step.body}</p>

                {step.docType === "AGREEMENT" ? (
                  <>
                    {canAgree ? (
                      <AgreementStep
                        projectId={id}
                        canWrite={can(actor, "agreement.write")}
                      />
                    ) : null}
                    <div className={canAgree ? "mt-3.5" : ""}>
                      <UploadSlot
                        projectId={id}
                        docType="AGREEMENT"
                        label={
                          canAgree ? "Or upload an agreement prepared elsewhere" : "Agreement"
                        }
                        hint="Only if you are not using the one made here"
                        existing={canAgree ? uploadedAgreement : existing}
                        canDelete={canDeleteDocs}
                      />
                    </div>
                  </>
                ) : step.docType === "QUOTATION" ? (
                  <>
                    {canQuote ? (
                      <QuotationStep
                        projectId={id}
                        canWrite={can(actor, "quotation.write")}
                      />
                    ) : null}
                    <div className={canQuote ? "mt-3.5" : ""}>
                      <UploadSlot
                        projectId={id}
                        docType="QUOTATION"
                        label={canQuote ? step.label! : "Quotation"}
                        {...(step.hint === undefined ? {} : { hint: step.hint })}
                        existing={canQuote ? uploadedQuotation : existing}
                      />
                    </div>
                  </>
                ) : step.docType ? (
                  <UploadSlot
                    projectId={id}
                    docType={step.docType as never}
                    label={step.label!}
                    {...(step.hint === undefined ? {} : { hint: step.hint })}
                    existing={existing}
                    canDelete={canDeleteDocs}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      {financed ? (
        <div className="mt-4.5">
          <BankFile
            projectId={id}
            docFor={docFor}
            hasCoApplicant={hasCoApplicant}
            canDelete={canDeleteDocs}
          />
        </div>
      ) : null}

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--muted)]">
        Closing stage 2 is what turns this prospect into a customer.
      </p>
      <Link
        href={`/projects/${id}`}
        className="mt-3 inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
      >
        Back to the stage gate
      </Link>
    </StageShell>
  );
}
