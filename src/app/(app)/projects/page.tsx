import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  electricityConnections,
  paymentPlans,
  projects,
  rooftopDetails,
} from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { STAGES } from "@/lib/workflow/stages";
import { STAGE_TITLES } from "@/lib/workflow/labels";

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
  { key: "lt3", label: "Under 3 kW", test: (kw: number) => kw < 3 },
  { key: "3to5", label: "3 – 5 kW", test: (kw: number) => kw >= 3 && kw < 5 },
  { key: "5to10", label: "5 – 10 kW", test: (kw: number) => kw >= 5 && kw < 10 },
  { key: "10plus", label: "10 kW and above", test: (kw: number) => kw >= 10 },
] as const;

const PAY_LABELS: Record<string, string> = {
  CASH: "Cash",
  FINANCE: "Finance",
  SPLIT: "Cash + finance",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  LEAD: "Leads",
  PROSPECT: "Prospects",
  CUSTOMER: "Customers",
};

type Filters = {
  q?: string;
  stage?: string;
  lifecycle?: string;
  kw?: string;
  place?: string;
  pay?: string;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const actor = await getActor();
  // The pipeline list, not a single project. `project.write` is the
  // permission for working the pipeline at all, which is the question here —
  // an installer and a partner each read individual projects at a narrower
  // scope and have their own page instead.
  if (!actor || !can(actor, "project.write")) notFound();

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
    if (value.startsWith("div:")) return name === "none" ? "no division" : name;
    return name === "none" ? "no PIN" : `PIN ${name}`;
  };

  const lifecycleCounts = new Map<string, number>();
  for (const r of rows) {
    lifecycleCounts.set(
      r.project.lifecycleStage,
      (lifecycleCounts.get(r.project.lifecycleStage) ?? 0) + 1,
    );
  }

  const filtersOn = Boolean(q || stage || lifecycle || kw || place || pay);

  const href = (next: Filters) => {
    const merged: Filters = { q, stage, lifecycle, kw, place, pay, ...next };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const str = params.toString();
    return str ? `/projects?${str}` : "/projects";
  };

  const selectClass =
    "h-11 min-w-36 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13.5px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--orange)]";

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <div className="mb-5">
        <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Projects</h1>
        <p className="text-sm text-[var(--muted)]">
          {rows.length} in all. Search by name, phone, project code, address, PIN, division or
          consumer number.
        </p>
      </div>

      <form action="/projects" className="mb-3 flex flex-wrap gap-2.5">
        {stage ? <input type="hidden" name="stage" value={stage} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Krishni, 98269…, BHIM-2026-0007, N2317015620"
          aria-label="Search projects"
          className="h-11 min-w-60 flex-1 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        />

        <select name="kw" defaultValue={kw} aria-label="Plant size" className={selectClass}>
          <option value="">Any size</option>
          {KW_BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label} ({kwCounts.get(b.key) ?? 0})
            </option>
          ))}
          <option value="none">Size not set ({noKw})</option>
        </select>

        <select
          name="place"
          defaultValue={place}
          aria-label="Division or PIN code"
          className={selectClass}
        >
          <option value="">Any place</option>
          <optgroup label="DISCOM division">
            {divisions.map(([name, n]) => (
              <option key={name} value={`div:${name}`}>
                {name} ({n})
              </option>
            ))}
            <option value="div:none">No division yet ({noDivision})</option>
          </optgroup>
          <optgroup label="PIN code">
            {pins.map(([pin, n]) => (
              <option key={pin} value={`pin:${pin}`}>
                PIN {pin} ({n})
              </option>
            ))}
            <option value="pin:none">No PIN on file ({noPin})</option>
          </optgroup>
        </select>

        <select name="pay" defaultValue={pay} aria-label="Finance option" className={selectClass}>
          <option value="">Any finance</option>
          {(["CASH", "FINANCE", "SPLIT"] as const).map((mode) => (
            <option key={mode} value={mode}>
              {PAY_LABELS[mode]} ({payCounts.get(mode) ?? 0})
            </option>
          ))}
          <option value="none">No plan yet ({noPay})</option>
        </select>

        <select
          name="lifecycle"
          defaultValue={lifecycle}
          aria-label="Lifecycle stage"
          className={selectClass}
        >
          <option value="">Any lifecycle</option>
          {(["LEAD", "PROSPECT", "CUSTOMER"] as const).map((l) => (
            <option key={l} value={l}>
              {LIFECYCLE_LABELS[l]} ({lifecycleCounts.get(l) ?? 0})
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)]"
        >
          Apply
        </button>
        {filtersOn ? (
          <Link
            href="/projects"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-bold text-[var(--navy)] no-underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {filtersOn ? (
        <p className="mb-3 text-[12.5px] text-[var(--muted)]">
          {filtered.length} of {rows.length} shown
          {kw ? ` · ${KW_BANDS.find((b) => b.key === kw)?.label ?? "size not set"}` : ""}
          {place ? ` · ${placeLabel(place)}` : ""}
          {pay ? ` · ${pay === "none" ? "no plan yet" : PAY_LABELS[pay]}` : ""}
          {lifecycle ? ` · ${LIFECYCLE_LABELS[lifecycle] ?? lifecycle}` : ""}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={href({ stage: "" })}
          aria-current={stage === "" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] no-underline ${
            stage === ""
              ? "bg-[var(--navy)] font-bold text-[var(--navy-ink)]"
              : "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--muted)]"
          }`}
        >
          All stages
          <span className="ref text-[11px] opacity-75">{inScope.length}</span>
        </Link>
        {STAGES.map((s) => {
          const n = perStage.get(s.no) ?? 0;
          const active = stage === String(s.no);
          return (
            <Link
              key={s.no}
              href={href({ stage: String(s.no) })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] no-underline ${
                active
                  ? "bg-[var(--navy)] font-bold text-[var(--navy-ink)]"
                  : "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--muted)]"
              } ${n === 0 && !active ? "opacity-55" : ""}`}
            >
              <span className="ref">{s.no}</span>
              {STAGE_TITLES[s.key]}
              <span className="ref text-[11px] opacity-75">{n}</span>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-12 text-center">
          <p className="mb-1 text-[15px] font-semibold">Nothing matches</p>
          <p className="text-[13.5px] text-[var(--muted)]">
            {needle ? `No project matches "${q}".` : "No project matches these filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          {filtered.map((r, i) => {
            const size = sizeOf(r);
            return (
              <Link
                key={r.project.id}
                href={`/projects/${r.project.id}`}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 no-underline ${
                  i < filtered.length - 1 ? "border-b border-[var(--line-soft)]" : ""
                }`}
              >
                <span
                  className={`ref flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold ${
                    r.project.lifecycleStage === "LEAD"
                      ? "bg-[var(--chip-soft)] text-[var(--muted)]"
                      : "bg-[var(--orange-soft)] text-[var(--orange-text)]"
                  }`}
                >
                  {r.project.pipelineStage}
                </span>

                <span className="min-w-44 flex-[2_1_220px]">
                  <span className="block text-[14px] font-semibold text-[var(--ink)]">
                    {r.contact.firstName} {r.contact.lastName ?? ""}
                  </span>
                  <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
                    {r.project.code} · {r.contact.phone}
                    {r.contact.pinCode ? ` · ${r.contact.pinCode}` : ""}
                    {r.division ? ` · ${r.division}` : ""}
                  </span>
                </span>

                <span className="min-w-32 flex-1 text-[12.5px] text-[var(--muted)]">
                  {size.kw === null ? (
                    <span className="text-[var(--muted-soft)]">size not set</span>
                  ) : size.exact ? (
                    <span className="ref font-semibold text-[var(--ink)]">
                      {r.rooftop?.plantKw} kW
                    </span>
                  ) : (
                    <span className="ref">~{size.kw} kW interest</span>
                  )}
                  {r.connection?.consumerNumber ? (
                    <span className="ref mt-0.5 block text-[11px]">
                      {r.connection.consumerNumber}
                    </span>
                  ) : null}
                </span>

                <span className="min-w-20 shrink-0 text-[12px] text-[var(--muted)]">
                  {r.payMode ? PAY_LABELS[r.payMode] : "—"}
                </span>

                <span className="min-w-28 shrink-0 text-[12.5px] text-[var(--muted)]">
                  {STAGE_TITLES[STAGES[r.project.pipelineStage - 1]?.key ?? "onboarding"]}
                </span>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                    r.project.lifecycleStage === "LEAD"
                      ? "bg-[var(--chip-soft)] text-[var(--muted)]"
                      : r.project.lifecycleStage === "CUSTOMER"
                        ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                        : "bg-[var(--navy-soft)] text-[var(--navy)]"
                  }`}
                >
                  {r.project.lifecycleStage}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
