import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { agreements } from "@/lib/db/schema";
import { inr } from "@/lib/quotations/content";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { AgreementRowActions } from "./agreement-actions";
import { UseThisAgreement } from "./use-this-agreement";

/**
 * The agreement step inside stage 2.
 *
 * Same shape as the quotation step beside it: the app makes the document,
 * and the upload slot underneath is the fallback for one drawn up by a
 * lawyer outside the app.
 *
 * This replaced a single "Generate agreement" button that was disabled
 * until an admin had locked the payment plan — which left the office unable
 * to produce a draft for a customer in the room, since clause 19.1 was read
 * from the plan. The cost is now typed on the agreement itself, prefilled
 * from the locked plan or the chosen quotation when either exists, so there
 * is nothing left to wait for.
 *
 * States amounts, so the caller checks `agreement.read` before rendering it.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued for signing",
  SIGNED: "Signed",
  CANCELLED: "Cancelled",
};

export async function AgreementStep({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const rows = await db
    .select({
      id: agreements.id,
      status: agreements.status,
      executionDate: agreements.executionDate,
      consumerName: agreements.consumerName,
      totalValue: agreements.totalValue,
      s3Key: agreements.s3Key,
      isPrimary: agreements.isPrimary,
    })
    .from(agreements)
    .where(and(eq(agreements.projectId, projectId), isNull(agreements.deletedAt)))
    .orderBy(asc(agreements.createdAt));

  // Attached to this project, so the admin-only rule applies.
  const canDelete = can(await getActor(), "agreement.delete.filed");

  const filed = rows.find((row) => row.isPrimary) ?? null;

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {canWrite ? (
          <Link
            href={`/agreements/new?project=${projectId}`}
            className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            {rows.length ? "Draw up another agreement" : "Draw up the agreement"}
          </Link>
        ) : null}

        {rows.length ? (
          <Link
            href="/agreements"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] no-underline"
          >
            All agreements
          </Link>
        ) : null}
      </div>

      {rows.length ? (
        <ul className="mt-3.5 m-0 list-none space-y-2 p-0">
          {rows.map((agreement) => (
            <li
              key={agreement.id}
              className={`flex flex-wrap items-center gap-2.5 rounded-[9px] border px-3.5 py-2.5 ${
                agreement.isPrimary
                  ? "border-[var(--green-border,var(--green-text))] bg-[var(--green-soft)]"
                  : "border-[var(--line)] bg-[var(--surface-2)]"
              }`}
            >
              <Link
                href={`/agreements/${agreement.id}`}
                className="text-[13px] font-bold no-underline"
              >
                {agreement.consumerName}
              </Link>
              <span className="ref flex-1 text-[12.5px] text-[var(--muted)]">
                Rs. {inr(Number(agreement.totalValue))} · {agreement.executionDate}
              </span>
              <span className="rounded-full bg-[var(--chip-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--chip-text)]">
                {STATUS_LABEL[agreement.status] ?? agreement.status}
              </span>
              {canWrite ? (
                <UseThisAgreement
                  id={agreement.id}
                  primary={agreement.isPrimary}
                  attached
                  cancelled={agreement.status === "CANCELLED"}
                />
              ) : agreement.isPrimary ? (
                <span className="rounded-full bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--green-text)]">
                  On file
                </span>
              ) : null}
              <AgreementRowActions
                id={agreement.id}
                hasFile={Boolean(agreement.s3Key)}
                canDelete={canDelete}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
        A Word file, not a PDF — the lawyer edits it to prepare the hard copy, and the signed,
        notarised scan is uploaded separately. The parties are filled from this project; clause
        19.1 is filled from the locked payment plan, or from the chosen quotation when the plan
        is not locked yet, and can be changed either way.
        {rows.length > 1
          ? " A project can hold several drafts, but only the one on file is counted here and printed in the bank loan pack."
          : ""}
      </p>

      {rows.length > 0 && !filed ? (
        <p
          role="alert"
          className="mt-2.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--amber-text)]"
        >
          None of these is on file, so this project has no agreement in its documents and the
          bank loan pack has nothing to print. Pick one.
        </p>
      ) : null}
    </div>
  );
}
