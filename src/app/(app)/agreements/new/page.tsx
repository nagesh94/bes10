import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyBranches } from "@/lib/db/schema";
import { AgreementForm } from "@/components/agreements/agreement-form";
import { emptyAgreement } from "@/lib/agreements/form-values";
import { prefillFromProject } from "@/lib/agreements/prefill";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * A new agreement, either blank or filled from a project.
 *
 * `?project=<id>` is the only difference between the two routes, as it is
 * for a quotation: from inside a project the parties and clause 19.1
 * arrive filled, and from the Agreements tab they do not. Everything after
 * that is the same form, which is why there is one page rather than two.
 *
 * Crucially this page no longer refuses when the payment plan is unlocked.
 * It fills the cost from the locked plan if there is one, from the chosen
 * quotation if there is not, and otherwise leaves it to be typed — because
 * the figure in clause 19.1 is agreed in conversation, often before anyone
 * opens the plan.
 */

const SOURCE_LINE: Record<string, string> = {
  plan: "filled from the locked payment plan.",
  quotation: "filled from the accepted quotation — the payment plan is not locked yet.",
  typed: "the parties are filled in; type the cost that was agreed.",
};

/**
 * Why Stage 1's Generate button sent you here instead of building the file.
 *
 * Read from the querystring, which anyone can edit, so the codes are looked
 * up in this list and anything unrecognised is dropped — nothing a stranger
 * puts in a link reaches the screen.
 */
const MISSING_PHRASE: Record<string, string> = {
  name: "the consumer’s name",
  address: "the consumer’s address",
  cost: "the cost for clause 19.1",
  instalments: "the instalments",
};

export default async function NewAgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; missing?: string }>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "agreement.write")) notFound();

  const { project: projectId, missing } = await searchParams;

  const stillNeeded = (missing ?? "")
    .split(",")
    .map((code) => MISSING_PHRASE[code.trim()])
    .filter((phrase): phrase is string => Boolean(phrase));

  const [branches] = await Promise.all([
    db.select().from(companyBranches).where(eq(companyBranches.isDefault, true)).limit(1),
  ]);
  const branch = branches[0];

  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  let initial = emptyAgreement(todayValue);
  let projectCode: string | null = null;
  let source: string = "typed";

  if (projectId) {
    const prefill = await prefillFromProject(projectId, initial);
    if (prefill.found) {
      initial = prefill.values;
      projectCode = prefill.projectCode;
      source = prefill.source;
    }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-6 pt-7 pb-14">
      <div className="mb-5">
        <Link
          href={projectId ? `/projects/${projectId}/stage-2` : "/agreements"}
          className="mb-3 inline-block text-[13px] font-semibold text-[var(--link)] no-underline"
        >
          ← {projectId && projectCode ? projectCode : "Agreements"}
        </Link>
        <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">New agreement</h1>
        <p className="text-sm text-[var(--muted)]">
          {projectCode
            ? `For ${projectCode} — ${SOURCE_LINE[source] ?? SOURCE_LINE.typed}`
            : "Not linked to any project — it can be attached to one later."}
        </p>
      </div>

      {stillNeeded.length > 0 ? (
        <p className="mb-5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3 text-[13px] leading-relaxed text-[var(--amber-body)]">
          <strong className="font-bold text-[var(--amber-text)]">
            Not enough on file to write it unattended.
          </strong>{" "}
          Everything this project knows is filled in below — add{" "}
          {stillNeeded.length === 1
            ? stillNeeded[0]
            : `${stillNeeded.slice(0, -1).join(", ")} and ${stillNeeded.at(-1)}`}
          , then generate.
        </p>
      ) : null}

      {!branch ? (
        <p className="rounded-[var(--radius)] border border-[var(--red-border)] bg-[var(--red-surface)] px-4 py-3.5 text-[13.5px] font-medium text-[var(--red-text)]">
          No company branch is set up, so the agreement has no second party to name. Add one
          under Admin first.
        </p>
      ) : (
        <AgreementForm mode="create" initial={initial} projectCode={projectCode} />
      )}
    </main>
  );
}
