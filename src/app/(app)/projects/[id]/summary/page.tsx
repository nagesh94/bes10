import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { StageShell } from "@/components/projects/stage-shell";
import { installerIdsFor } from "@/lib/projects/crew";
import { loadProjectSummary, type SummarySection } from "@/lib/projects/summary";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { useTranslations } from "next-intl";

/**
 * Everything known about one customer, on one page.
 *
 * Reading matter, not a form: nothing here can be edited, because the field
 * belongs to the stage that collects it and two places to change one value
 * is how they drift. The money block is the one part that is gated — an
 * employee opening this sees every field except the amounts, which is the
 * same rule as everywhere else.
 */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) notFound();

  const [row] = await db
    .select({ assignedEmployeeId: projects.assignedEmployeeId })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  if (
    !can(actor, "project.read", {
      assignedEmployeeId: row.assignedEmployeeId,
      assignedInstallerIds: await installerIdsFor(id),
    })
  ) {
    notFound();
  }

  // Two gates, both the same ones the stages themselves use: the amounts are
  // admin-only, and the identity and bank papers belong to stage 1, which an
  // installer never opens. Neither is hidden in the markup — the rows are
  // not read from the database at all.
  const showMoney = canSeeMoney(actor.roles);
  const showPersonal = can(actor, "prospect.write");
  const summary = await loadProjectSummary(id, {
    includeMoney: showMoney,
    includePersonal: showPersonal,
  });
  if (!summary) notFound();

  const t = await getTranslations("summary");
  const hiddenNote =
    !showPersonal && !showMoney
      ? t("hiddenBoth")
      : !showPersonal
        ? t("hiddenPersonal")
        : !showMoney
          ? t("hiddenMoney")
          : null;

  return (
    <StageShell
      projectId={id}
      stageNo={null}
      title={t("title")}
      note={hiddenNote ?? t("noteAll")}
    >
      {/* Columns rather than a grid: the sections are wildly different
          heights — four rows for the rooftop, twenty for the installation —
          and a grid would leave a hole beside every short one. */}
      <div className="columns-1 gap-4.5 lg:columns-2 [&>*]:mb-4.5 [&>*]:break-inside-avoid">
        {summary.sections.map((s) => (
          <Section key={s.key} section={s} />
        ))}

        {summary.panelSerials.length ? (
          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <h2 className="text-base font-bold">{t("moduleSerials")}</h2>
            <p className="mt-0.5 mb-3.5 text-[12.5px] text-[var(--muted)]">
              {t("scanned", { count: summary.panelSerials.length })}
            </p>
            <ul className="flex flex-wrap gap-1.5 pl-0">
              {summary.panelSerials.map((serial, i) => (
                <li
                  key={`${serial}-${i}`}
                  className="ref list-none rounded-[6px] bg-[var(--surface-sunken)] px-2 py-1 text-[11.5px]"
                >
                  {serial}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </StageShell>
  );
}

function Section({ section }: { section: SummarySection }) {
  const t = useTranslations("summary");
  return (
    <section
      className={`rounded-[var(--radius)] border bg-[var(--surface)] px-6 py-5 ${
        section.blank ? "border-dashed border-[var(--line)]" : "border-[var(--line)]"
      }`}
    >
      <h2 className={`text-base font-bold ${section.blank ? "text-[var(--muted)]" : ""}`}>
        {section.title}
      </h2>
      {section.blurb ? (
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{section.blurb}</p>
      ) : null}

      {section.blank ? (
        <p className="mt-3 text-[13px] text-[var(--muted)]">{t("nothingYet")}</p>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {section.rows.map((r) => (
            <div key={r.label} className={r.wide ? "sm:col-span-2" : undefined}>
              <dt className="text-[11.5px] font-semibold text-[var(--muted)]">{r.label}</dt>
              <dd
                className={`mt-0.5 text-[13.5px] font-semibold break-words ${
                  r.mono ? "ref" : ""
                } ${r.value === "—" ? "text-[var(--muted-soft)]" : ""}`}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
