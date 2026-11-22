import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  channelPartners,
  contacts,
  electricityConnections,
  flags as flagsTable,
  paymentPlans,
  projects,
  rooftopDetails,
} from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { FlagsChip } from "@/components/projects/flags-chip";
import { ListPager } from "@/components/shell/list-controls";
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from "@/lib/list/params";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { STAGES } from "@/lib/workflow/stages";
import { getTranslations } from "next-intl/server";

/**
 * Every project, searchable.
 *
 * The dashboard groups by stage, which answers "what needs doing today". This
 * answers the other question — "where is the Nagde job" — and is the page you
 * reach for when somebody phones.
 *
 * No money appears here, so it is open to employees as well as admins. The
 * payment *mode* is not an amount — see the note on the join below.
 */

/** URL keys, not labels, so a bookmarked filter survives a copy change. */
const KW_BANDS = [
  { key: "lt3", test: (kw: number) => kw < 3 },
  { key: "3to5", test: (kw: number) => kw >= 3 && kw < 5 },
  { key: "5to10", test: (kw: number) => kw >= 5 && kw < 10 },
  { key: "10plus", test: (kw: number) => kw >= 10 },
] as const;

const PAY_LABELS: Record<string, true> = { CASH: true, FINANCE: true, SPLIT: true };

/* Prospect is deliberately not offered as a filter. It is a passing state
   between a lead and a customer, not a bucket anyone works out of, and a
   third option here only ever split the list someone wanted whole. A
   prospect row still says so — the blue chip on the row carries it. */
const LIFECYCLE_LABELS: Record<string, true> = { LEAD: true, CUSTOMER: true };

type Filters = {
  q?: string;
  stage?: string;
  lifecycle?: string;
  kw?: string;
  place?: string;
  pay?: string;
  page?: string;
  per?: string;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const [actor, t, tl, te, ts] = await Promise.all([
    getActor(),
    getTranslations("projects.list"),
    getTranslations("labels"),
    getTranslations("enums"),
    getTranslations(),
  ]);
  const STAGE_TITLES = Object.fromEntries(STAGES.map((s) => [s.key, tl(`stageTitles.${s.key}`)])) as Record<string, string>;
  const bandLabel = (key: string) => t(`kwBands.${key}`);
  const payLabel = (mode: string) => te(`payMode.${mode}`);
  const lifecycleLabel = (l: string) => te(`lifecyclePlural.${l}`);
  // The pipeline list, not a single project. `project.write` is the
  // permission for working the pipeline at all, which is the question here —
  // an installer and a partner each read individual projects at a narrower
  // scope and have their own page instead.
  if (!actor || !can(actor, "project.write")) notFound();
  // Today the two permissions carry the same roles, but the flags page is
  // gated on its own one — so the chip is only offered to whoever can
  // actually open what it links to.
  const canSeeFlags = can(actor, "flag.resolve");

  const raw = await searchParams;

  // Every one of these arrives in a URL anyone can type, so an unknown value
  // falls back to "no filter" rather than being carried into the summary line
  // and the chip links as a filter nothing can match.
  const q = (raw.q ?? "").trim().slice(0, 80);
  const stage = /^[1-9]$/.test(raw.stage ?? "") ? (raw.stage as string) : "";
  const lifecycle =
    raw.lifecycle && raw.lifecycle in LIFECYCLE_LABELS ? (raw.lifecycle as string) : "";
  const kw =
    raw.kw === "none" || KW_BANDS.some((b) => b.key === raw.kw) ? (raw.kw as string) : "";
  // "Place" is two things the office uses interchangeably: the DISCOM
  // division a job is filed under and the customer's PIN. One control offers
  // both, so the value carries which it is — `div:Betul South`, `pin:460001`,
  // or `…:none` for the projects that have neither on file yet.
  const place = /^(div|pin):.{1,80}$/s.test(raw.place ?? "") ? (raw.place as string) : "";
  const pay = raw.pay === "none" || (raw.pay && raw.pay in PAY_LABELS) ? (raw.pay as string) : "";

  // Same two keys, the same options and the same default as the quotations
  // and agreements lists, so a pager link means the same thing everywhere.
  const perRaw = Number(raw.per);
  const per = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : DEFAULT_PER_PAGE;
  const pageRaw = Number(raw.page);
  const requestedPage = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const rows = await db
    .select({
      project: projects,
      contact: contacts,
      rooftop: rooftopDetails,
      connection: electricityConnections,
      // Mode only. Everything else in `payment_plans` is an amount and this
      // page is open to employees, so the column list is the control — the
      // same line stage 2 already draws between a workflow fact and money.
      payMode: paymentPlans.mode,
      // Only ever set on a prospect — a lead has no application row yet, so
      // it lands under "no division" until stage 1 fills it in.
      division: applicationDetails.divisionName,
    })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(rooftopDetails, eq(rooftopDetails.projectId, projects.id))
    .leftJoin(electricityConnections, eq(electricityConnections.projectId, projects.id))
    .leftJoin(paymentPlans, eq(paymentPlans.projectId, projects.id))
    .leftJoin(applicationDetails, eq(applicationDetails.projectId, projects.id))
    .orderBy(desc(projects.updatedAt))
    .limit(500);

  /**
   * Which jobs are blocked, in one query rather than one per row.
   *
   * Open and in-progress both block the job; resolved and waived do not. The
   * table holds at most two rows per project — the unique index on
   * (project, type) guarantees it — so fetching every open flag is a few
   * hundred rows at the outside, cheaper than a correlated count per row.
   */
  const openFlagRows = await db
    .select({
      projectId: flagsTable.projectId,
      type: flagsTable.type,
      status: flagsTable.status,
    })
    .from(flagsTable)
    .where(inArray(flagsTable.status, ["OPEN", "IN_PROGRESS"]));

  const flagsByProject = new Map<string, Array<{ type: string; status: string }>>();
  for (const f of openFlagRows) {
    const list = flagsByProject.get(f.projectId);
    if (list) list.push(f);
    else flagsByProject.set(f.projectId, [f]);
  }

  // Carried by the add-project dialog, which holds the lead form.
  const partners = await db
    .select({ id: channelPartners.id, name: channelPartners.name, phone: channelPartners.phone })
    .from(channelPartners)
    .where(eq(channelPartners.active, true))
    .orderBy(channelPartners.name);

  type Row = (typeof rows)[number];

  /**
   * The size to filter and sort on.
   *
   * A surveyed roof has a real figure in `plant_kw`. A lead has only what it
   * asked for — free text like "3 kW" — so the number is read out of it and
   * marked inexact, which is what the list labels "interest". Filtering by
   * 3–5 kW and missing every 3 kW enquiry would be the wrong answer.
   */
  const sizeOf = (r: Row): { kw: number | null; exact: boolean } => {
    const measured = r.rooftop?.plantKw == null ? NaN : Number(r.rooftop.plantKw);
    if (Number.isFinite(measured) && measured > 0) return { kw: measured, exact: true };
    const wanted = Number.parseFloat(r.project.interestedPlantKw ?? "");
    if (Number.isFinite(wanted) && wanted > 0) return { kw: wanted, exact: false };
    return { kw: null, exact: false };
  };

  const needle = q.trim().toLowerCase();

  const matchesText = (r: Row) => {
    if (!needle) return true;
    return [
      r.project.code,
      `${r.contact.firstName} ${r.contact.lastName ?? ""}`,
      r.contact.phone,
      r.contact.address ?? "",
      r.contact.pinCode ?? "",
      r.division ?? "",
      r.connection?.consumerNumber ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  };

  const matchesKw = (r: Row) => {
    if (!kw) return true;
    const { kw: value } = sizeOf(r);
    if (kw === "none") return value === null;
    const band = KW_BANDS.find((b) => b.key === kw);
    if (!band) return true;
    return value !== null && band.test(value);
  };

  const matchesPlace = (r: Row) => {
    if (!place) return true;
    const value = place.slice(4);
    const actual = (place.startsWith("div:") ? r.division : r.contact.pinCode)?.trim();
    return value === "none" ? !actual : actual === value;
  };

  const matchesPay = (r: Row) => {
    if (!pay) return true;
    if (pay === "none") return !r.payMode;
    return r.payMode === pay;
  };

  const matchesLifecycle = (r: Row) => !lifecycle || r.project.lifecycleStage === lifecycle;
  const matchesStage = (r: Row) => !stage || String(r.project.pipelineStage) === stage;

  /**
   * The stage chips count what each stage *would* show under the filters that
   * are set, so the numbers add up to the list below rather than to the whole
   * table. Only the stage itself is left out, since that is what they pick.
   */
  const inScope = rows.filter(
    (r) => matchesLifecycle(r) && matchesText(r) && matchesKw(r) && matchesPlace(r) && matchesPay(r),
  );
  const filtered = inScope.filter(matchesStage);

  /**
   * One page of the list.
   *
   * The slice is taken here rather than in SQL because the filters above are
   * not all SQL: the size bands read a measured figure or parse a lead's
   * free-text "3 kW", and the search runs over a joined line of name, code,
   * phone, address, PIN, division and consumer number. Both would have to be
   * expressions in the query before an OFFSET could mean anything, and an
   * OFFSET over the wrong rows is worse than none.
   *
   * The page number is clamped to what exists: arriving on page 9 of a list
   * that now has two — a bookmark, or a filter narrowed since — should show
   * the last page, not an empty table that reads as "nothing here".
   */
  const pageCount = Math.max(1, Math.ceil(filtered.length / per));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = filtered.slice((page - 1) * per, page * per);

  const perStage = new Map<number, number>();
  for (const r of inScope) {
    perStage.set(r.project.pipelineStage, (perStage.get(r.project.pipelineStage) ?? 0) + 1);
  }

  // The places, sizes and modes offered are the ones the data actually has —
  // an empty option is a dead end the office has to try before it learns it is
  // empty. Counted over every row so a choice never disappears mid-filter.
  const pinCounts = new Map<string, number>();
  let noPin = 0;
  const divisionCounts = new Map<string, number>();
  let noDivision = 0;
  const payCounts = new Map<string, number>();
  let noPay = 0;
  const kwCounts = new Map<string, number>();
  let noKw = 0;
  for (const r of rows) {
    const pin = r.contact.pinCode?.trim();
    if (pin) pinCounts.set(pin, (pinCounts.get(pin) ?? 0) + 1);
    else noPin += 1;

    const division = r.division?.trim();
    if (division) divisionCounts.set(division, (divisionCounts.get(division) ?? 0) + 1);
    else noDivision += 1;

    if (r.payMode) payCounts.set(r.payMode, (payCounts.get(r.payMode) ?? 0) + 1);
    else noPay += 1;

    const { kw: size } = sizeOf(r);
    if (size === null) noKw += 1;
    else {
      const band = KW_BANDS.find((b) => b.test(size));
      if (band) kwCounts.set(band.key, (kwCounts.get(band.key) ?? 0) + 1);
    }
  }
  const byName = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]);
  const pins = [...pinCounts.entries()].sort(byName);
  const divisions = [...divisionCounts.entries()].sort(byName);

  /** What the summary line calls the chosen place. */
  const placeLabel = (value: string) => {
    const name = value.slice(4);
    if (value.startsWith("div:")) return name === "none" ? t("noDivision") : name;
    return name === "none" ? t("noPin") : t("pin", { pin: name });
  };

  const lifecycleCounts = new Map<string, number>();
  for (const r of rows) {
    lifecycleCounts.set(
      r.project.lifecycleStage,
      (lifecycleCounts.get(r.project.lifecycleStage) ?? 0) + 1,
    );
  }

  const filtersOn = Boolean(q || stage || lifecycle || kw || place || pay);

  /* One set of cell classes so every column is padded and baselined the
     same. The header says what each column is — without it the numbers and
     the bare strings in a row are a guessing game. */
  const th =
    "px-4 py-2.5 align-middle text-[11px] font-bold tracking-[0.06em] whitespace-nowrap text-[var(--muted)] uppercase";
  const td = "px-4 py-3 align-middle";
  /** An empty cell is a dash in the faintest ink, not a gap. */
  const blank = "text-[var(--muted-soft)]";

  const selectClass =
    "h-11 min-w-36 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13.5px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--orange)]";
  /** The page size holds two or three digits, not a sentence. */
  const perClass =
    "h-11 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13.5px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--orange)]";

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">{ts("nav.projects")}</h1>
          <p className="text-sm text-[var(--muted)]">
            {t("inAll", { count: rows.length })}
          </p>
        </div>
        {/* A project starts life as a lead row, so this is the lead form —
            adding one here saves the detour through /leads for an office
            that works out of this list. */}
        <NewLeadDialog
          partners={partners}
          label={t("addProject")}
          title={t("addProjectTitle")}
          blurb={t("addProjectBlurb")}
          submitLabel={t("createProject")}
        />
      </div>

      <form action="/projects" className="mb-3 flex flex-wrap gap-2.5">
        <input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchAria")}
          className="h-11 min-w-60 flex-1 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        />

        {/* The stage used to be nine chips across the page, which took a
            band the width of the window to say one thing. It is a filter
            like the rest, so it sits with the rest — and the option list
            doubles as the key to the numbers in the first column. */}
        <select name="stage" defaultValue={stage} aria-label={t("stageAria")} className={selectClass}>
          <option value="">{t("anyStage", { count: inScope.length })}</option>
          {STAGES.map((s) => (
            <option key={s.no} value={String(s.no)}>
              {s.no} · {STAGE_TITLES[s.key]} ({perStage.get(s.no) ?? 0})
            </option>
          ))}
        </select>

        <select name="kw" defaultValue={kw} aria-label={t("sizeAria")} className={selectClass}>
          <option value="">{t("anySize")}</option>
          {KW_BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {bandLabel(b.key)} ({kwCounts.get(b.key) ?? 0})
            </option>
          ))}
          <option value="none">{t("sizeNotSet", { count: noKw })}</option>
        </select>

        <select
          name="place"
          defaultValue={place}
          aria-label={t("placeAria")}
          className={selectClass}
        >
          <option value="">{t("anyPlace")}</option>
          <optgroup label={t("discomDivision")}>
            {divisions.map(([name, n]) => (
              <option key={name} value={`div:${name}`}>
                {name} ({n})
              </option>
            ))}
            <option value="div:none">{t("noDivisionYet", { count: noDivision })}</option>
          </optgroup>
          <optgroup label={t("pinCode")}>
            {pins.map(([pin, n]) => (
              <option key={pin} value={`pin:${pin}`}>
                {t("pin", { pin })} ({n})
              </option>
            ))}
            <option value="pin:none">{t("noPinOnFile", { count: noPin })}</option>
          </optgroup>
        </select>

        <select name="pay" defaultValue={pay} aria-label={t("financeAria")} className={selectClass}>
          <option value="">{t("anyFinance")}</option>
          {(["CASH", "FINANCE", "SPLIT"] as const).map((mode) => (
            <option key={mode} value={mode}>
              {payLabel(mode)} ({payCounts.get(mode) ?? 0})
            </option>
          ))}
          <option value="none">{t("noPlanYet", { count: noPay })}</option>
        </select>

        <select
          name="lifecycle"
          defaultValue={lifecycle}
          aria-label={t("lifecycleAria")}
          className={selectClass}
        >
          <option value="">{t("anyLifecycle")}</option>
          {(["LEAD", "CUSTOMER"] as const).map((l) => (
            <option key={l} value={l}>
              {lifecycleLabel(l)} ({lifecycleCounts.get(l) ?? 0})
            </option>
          ))}
        </select>

        {/* No hidden `page` field, so applying a filter always lands on page
            one — staying on page 9 of a list that now has two looks broken. */}
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)]">
          {ts("shell.show")}
          <select name="per" defaultValue={String(per)} aria-label={ts("shell.rowsPerPage")} className={perClass}>
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)]"
        >
          {t("apply")}
        </button>
        {filtersOn ? (
          <Link
            href="/projects"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-bold text-[var(--navy-text)] no-underline"
          >
            {t("clear")}
          </Link>
        ) : null}
      </form>

      {filtersOn ? (
        <p className="mb-3 text-[12.5px] text-[var(--muted)]">
          {t("shownOf", { shown: filtered.length, total: rows.length })}
          {stage
            ? ` · ${t("stageSummary", { no: stage, title: STAGE_TITLES[STAGES[Number(stage) - 1]?.key ?? "onboarding"] ?? "" })}`
            : ""}
          {kw ? ` · ${KW_BANDS.some((b) => b.key === kw) ? bandLabel(kw) : t("sizeNotSetLower")}` : ""}
          {place ? ` · ${placeLabel(place)}` : ""}
          {pay ? ` · ${pay === "none" ? t("noPlanYetLower") : payLabel(pay)}` : ""}
          {lifecycle ? ` · ${lifecycleLabel(lifecycle)}` : ""}
        </p>
      ) : null}


      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-12 text-center">
          <p className="mb-1 text-[15px] font-semibold">{t("nothingMatches")}</p>
          <p className="text-[13.5px] text-[var(--muted)]">
            {needle ? t("noMatchQuery", { q }) : t("noMatchFilters")}
          </p>
        </div>
      ) : (
        /* A real table, because this is tabular data and the eye needs a
           column to run down. It scrolls sideways under ~960px rather than
           reflowing: a row that wraps is a row whose columns stop lining up,
           which is what made the old flex list hard to read. */
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                {/* The number is the stage; its name is on the chips above
                    and on hover, rather than spending a whole column on a
                    phrase that repeats down the page. */}
                <th scope="col" className={`${th} w-16 text-center`} title={t("stageTitle")}>
                  {t("colStage")}
                </th>
                <th scope="col" className={`${th} min-w-[240px]`}>
                  {t("colCustomer")}
                </th>
                <th scope="col" className={`${th} w-36`}>
                  {t("colPhone")}
                </th>
                <th scope="col" className={`${th} w-40`}>
                  {t("colConsumer")}
                </th>
                <th scope="col" className={`${th} w-32`}>
                  {t("colPlant")}
                </th>
                <th scope="col" className={`${th} w-36`}>
                  {t("colFinance")}
                </th>
                {canSeeFlags ? (
                  <th scope="col" className={`${th} w-24`}>
                    {t("colFlags")}
                  </th>
                ) : null}
                <th scope="col" className={`${th} w-28`}>
                  {t("colStatus")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const size = sizeOf(r);
                const openFlags = flagsByProject.get(r.project.id) ?? [];
                const name = `${r.contact.firstName} ${r.contact.lastName ?? ""}`.trim();
                const stageKey = STAGES[r.project.pipelineStage - 1]?.key ?? "onboarding";
                return (
                  /* `relative` on the row so the stretched link below covers
                     the whole of it. The row cannot itself be an anchor —
                     the flags chip inside it is a link, and an anchor cannot
                     nest inside an anchor. */
                  <tr
                    key={r.project.id}
                    className="relative border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className={`${td} text-center`}>
                      <span
                        title={t("stageRowTitle", { no: r.project.pipelineStage, title: STAGE_TITLES[stageKey] ?? "" })}
                        className={`ref inline-flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-bold ${
                          r.project.lifecycleStage === "LEAD"
                            ? "bg-[var(--chip-soft)] text-[var(--muted)]"
                            : "bg-[var(--orange-soft)] text-[var(--orange-text)]"
                        }`}
                      >
                        {r.project.pipelineStage}
                        <span className="sr-only"> — {STAGE_TITLES[stageKey]}</span>
                      </span>
                    </td>

                    <td className={td}>
                      <Link
                        href={`/projects/${r.project.id}`}
                        aria-label={`${name} — ${r.project.code}`}
                        className="absolute inset-0 z-0 no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--orange)]"
                      />
                      <span className="block text-[14px] font-semibold text-[var(--ink)]">
                        {name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                        {r.division ?? t("noDivisionYetPlain")}
                      </span>
                    </td>

                    <td className={`${td} ref text-[12.5px] text-[var(--muted)]`}>
                      {r.contact.phone}
                    </td>

                    <td className={`${td} ref text-[12.5px] text-[var(--muted)]`}>
                      {r.connection?.consumerNumber ?? <span className={blank}>—</span>}
                    </td>

                    <td className={`${td} text-[12.5px]`}>
                      {size.kw === null ? (
                        <span className={blank}>{t("notSet")}</span>
                      ) : size.exact ? (
                        <span className="ref font-semibold text-[var(--ink)]">
                          {r.rooftop?.plantKw} kW
                        </span>
                      ) : (
                        <span className="ref text-[var(--muted)]">{t("kwInterest", { kw: size.kw })}</span>
                      )}
                    </td>

                    <td className={`${td} text-[12.5px] whitespace-nowrap text-[var(--muted)]`}>
                      {r.payMode ? payLabel(r.payMode) : <span className={blank}>—</span>}
                    </td>

                    {/* Above the row overlay, so the chip takes the click and
                        goes to the flags page rather than to the project. */}
                    {canSeeFlags ? (
                      <td className={`${td} relative z-10`}>
                        <FlagsChip projectId={r.project.id} openFlags={openFlags} compact />
                      </td>
                    ) : null}

                    <td className={td}>
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                          r.project.lifecycleStage === "LEAD"
                            ? "bg-[var(--chip-soft)] text-[var(--muted)]"
                            : r.project.lifecycleStage === "CUSTOMER"
                              ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                              : "bg-[var(--navy-soft)] text-[var(--link)]"
                        }`}
                      >
                        {te(`lifecycle.${r.project.lifecycleStage}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Under the table, and only when there is a table: the same pager the
          quotations and agreements lists use, so "Next" is in the same place
          and means the same thing. It counts the filtered list, not the
          whole table, which is the list being paged. */}
      {filtered.length > 0 ? (
        <ListPager total={filtered.length} page={page} per={per} noun={t("noun")} />
      ) : null}
    </main>
  );
}
