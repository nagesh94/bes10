import Link from "next/link";
import { Calculator, ClipboardList, FileStack, IndianRupee } from "lucide-react";
import type { ProjectHeaderData } from "@/lib/projects/header";
import { FlagsChip } from "@/components/projects/flags-chip";
import { useTranslations } from "next-intl";

/* PROSPECT reads with --link rather than --navy: on a dark ground the navy
   ink and the navy chip behind it are within a hair of each other, and the
   word disappeared. */
const LIFECYCLE_CHIP: Record<string, string> = {
  LEAD: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  PROSPECT: "bg-[var(--navy-soft)] text-[var(--link)]",
  CUSTOMER: "bg-[var(--green-soft)] text-[var(--green-text)]",
};

/**
 * Whose project this is.
 *
 * The customer's name is the heading on every page of the project, not a
 * line of small print under a stage title: someone three stages deep with
 * two jobs open in two tabs has to be able to tell at a glance which roof
 * they are filling a form about. The stage title is the subheading, because
 * the stage is where you are and the name is what you are working on.
 *
 * The three side pages that are not stages — documents, flags, the payment
 * plan — hang off this header as chips rather than off a second navigation
 * panel competing with the stepper.
 */
export function ProjectHeader({
  data,
  canSeeMoney,
  canSeeDocuments,
}: {
  data: ProjectHeaderData;
  canSeeMoney: boolean;
  canSeeDocuments: boolean;
}) {
  const t = useTranslations("projects.c");
  const te = useTranslations("enums");
  const meta: Array<{ k: string; v: string; mono?: boolean }> = [
    { k: t("plantSize"), v: data.plantKw },
    { k: t("portalId"), v: data.portalId ?? "—", mono: true },
    { k: t("consumerNo"), v: data.consumerNumber ?? "—", mono: true },
    { k: t("phone"), v: data.phone, mono: true },
    { k: t("division"), v: data.divisionName ?? "—" },
  ];

  const chip =
    "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[12.5px] font-semibold text-[var(--ink)] no-underline hover:bg-[var(--surface-sunken)]";


  return (
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5 sm:px-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-60 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="ref text-[12.5px] font-medium text-[var(--muted)]">{data.code}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] uppercase ${
                LIFECYCLE_CHIP[data.lifecycleStage] ?? ""
              }`}
            >
              {te(`lifecycle.${data.lifecycleStage}`)}
            </span>
            {data.isDcr ? (
              <span className="rounded bg-[var(--green-soft)] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-[var(--green-text)] uppercase">
                DCR
              </span>
            ) : null}
          </div>

          <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.02em] sm:text-[29px]">
            {data.fullName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSeeDocuments ? (
            <Link href={`/projects/${data.id}/documents`} className={chip}>
              <FileStack size={15} strokeWidth={2} aria-hidden />
              {t("documents")}
            </Link>
          ) : null}
          <FlagsChip projectId={data.id} openFlags={data.openFlags} />
          {canSeeMoney ? (
            <Link href={`/projects/${data.id}/payments`} className={chip}>
              <IndianRupee size={15} strokeWidth={2} aria-hidden />
              {t("paymentPlan")}
            </Link>
          ) : null}
          {canSeeMoney ? (
            <Link href={`/projects/${data.id}/costs`} className={chip}>
              <Calculator size={15} strokeWidth={2} aria-hidden />
              {t("costCalculator")}
            </Link>
          ) : null}
          {/* Next to the payment plan on purpose: the two questions asked
              over the telephone are what they owe and what we hold on them,
              and the second one was spread over nine stages until now. */}
          <Link href={`/projects/${data.id}/summary`} className={chip}>
            <ClipboardList size={15} strokeWidth={2} aria-hidden />
            {t("summary")}
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t border-[var(--line-soft)] pt-3.5">
        {meta.map((m) => (
          <div key={m.k}>
            <div className="text-[11.5px] font-semibold text-[var(--muted)]">{m.k}</div>
            <div className={`mt-0.5 text-[13.5px] font-semibold ${m.mono ? "ref" : ""}`}>{m.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
