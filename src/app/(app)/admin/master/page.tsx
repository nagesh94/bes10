import Link from "next/link";
import type { ReactNode } from "react";
import { asc, eq } from "drizzle-orm";
import { AddMaster, RemoveZoneButton, RetireButton } from "@/components/admin/add-master";
import { DiscomLinksForm } from "@/components/admin/discom-links-form";
import { TemplateList } from "@/components/admin/template-list";
import { MASTER_CATEGORIES, masterCategory, type MasterCategory } from "@/lib/admin/catalog";
import { loadTemplates } from "@/lib/admin/templates";
import { db } from "@/lib/db";
import {
  banks,
  cableMakes,
  discomCircles,
  discomCompanies,
  discomDivisions,
  discomRegions,
  discomZones,
  inverterModels,
  panelCompanies,
  panelModels,
  panelTypes,
  plantSizes,
  structureCompanies,
} from "@/lib/db/schema";

function kwLabel(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return `${Number.isInteger(n) ? n.toFixed(0) : n} kW`;
}

function sortActive<T extends { active: boolean }>(rows: T[], name: (row: T) => string): T[] {
  return [...rows].sort((a, b) => Number(b.active) - Number(a.active) || name(a).localeCompare(name(b)));
}

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const cat = masterCategory((await searchParams).cat);

  const [
    companies,
    types,
    models,
    inverters,
    structures,
    cableMakeRows,
    bankRows,
    sizes,
    discoms,
    regions,
    circles,
    divisions,
    zones,
    templates,
  ] = await Promise.all([
    db.select().from(panelCompanies).orderBy(asc(panelCompanies.name)),
    db.select().from(panelTypes).orderBy(asc(panelTypes.name)),
    db
      .select({
        id: panelModels.id,
        modelNo: panelModels.modelNo,
        wattPeak: panelModels.wattPeak,
        isDcr: panelModels.isDcr,
        active: panelModels.active,
        company: panelCompanies.name,
        companyId: panelModels.companyId,
      })
      .from(panelModels)
      .innerJoin(panelCompanies, eq(panelModels.companyId, panelCompanies.id))
      .orderBy(asc(panelCompanies.name), asc(panelModels.wattPeak)),
    db.select().from(inverterModels).orderBy(asc(inverterModels.manufacturer), asc(inverterModels.modelNo)),
    db.select().from(structureCompanies).orderBy(asc(structureCompanies.name)),
    db.select().from(cableMakes).orderBy(asc(cableMakes.name)),
    db.select().from(banks).orderBy(asc(banks.name)),
    db.select().from(plantSizes).orderBy(asc(plantSizes.kw)),
    db.select().from(discomCompanies).orderBy(asc(discomCompanies.name)),
    db.select().from(discomRegions),
    db.select().from(discomCircles),
    db.select().from(discomDivisions),
    db
      .select({
        id: discomZones.id,
        name: discomZones.name,
        divisionId: discomDivisions.id,
        division: discomDivisions.name,
        circle: discomCircles.name,
        region: discomRegions.name,
        companyId: discomRegions.companyId,
      })
      .from(discomZones)
      .innerJoin(discomDivisions, eq(discomZones.divisionId, discomDivisions.id))
      .innerJoin(discomCircles, eq(discomDivisions.circleId, discomCircles.id))
      .innerJoin(discomRegions, eq(discomCircles.regionId, discomRegions.id))
      .orderBy(asc(discomRegions.name), asc(discomCircles.name), asc(discomDivisions.name), asc(discomZones.name)),
    loadTemplates(),
  ]);

  const counts: Record<MasterCategory, number> = {
    "panel-companies": companies.length,
    "panel-types": types.length,
    "panel-models": models.length,
    inverters: inverters.length,
    structures: structures.length,
    "cable-makes": cableMakeRows.length,
    banks: bankRows.length,
    discom: discoms.length + regions.length + circles.length + divisions.length + zones.length,
    "plant-sizes": sizes.length,
  };

  const divisionOptions = divisions
    .map((division) => {
      const circle = circles.find((item) => item.id === division.circleId);
      return { id: division.id, label: circle ? `${division.name} · ${circle.name}` : division.name };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const current = MASTER_CATEGORIES.find((item) => item.key === cat)!;

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-[26px] pb-14">
      <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Master data & templates</h1>
      <p className="mb-5 max-w-[760px] text-sm text-[var(--muted)]">
        Everything here is editable without a deploy. Add a panel model or a new agreement wording and it is live for the next project.
      </p>

      <div className="flex flex-wrap items-start gap-[18px]">
        <aside className="w-full max-w-[280px] min-w-[210px] flex-[1_1_230px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-[9px]">
          {MASTER_CATEGORIES.map((item) => {
            const active = item.key === cat;
            return (
              <Link
                key={item.key}
                href={`/admin/master?cat=${item.key}`}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] px-3 py-[11px] no-underline ${
                  active ? "bg-[var(--navy-soft)] text-[var(--link)]" : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="min-w-0 flex-1 text-left text-[13.5px] font-semibold">{item.label}</span>
                <span
                  className={`ref shrink-0 rounded-full px-2 py-[3px] text-[11.5px] font-semibold text-[var(--muted)] ${
                    active ? "bg-[var(--surface)]" : "bg-[var(--chip-soft)]"
                  }`}
                >
                  {counts[item.key]}
                </span>
              </Link>
            );
          })}
        </aside>

        <section className="min-w-80 flex-[1_1_420px] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-4">
            <h2 className="m-0 flex-1 text-base font-bold">{current.label}</h2>
            <AddMaster
              key={cat}
              category={cat}
              addLabel={current.addLabel}
              companies={companies.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }))}
              divisions={divisionOptions}
            />
          </div>
          <Catalog
            cat={cat}
            companies={sortActive(companies, (row) => row.name)}
            types={sortActive(types, (row) => row.name)}
            models={sortActive(models, (row) => row.modelNo)}
            inverters={sortActive(inverters, (row) => row.modelNo)}
            structures={sortActive(structures, (row) => row.name)}
            cableMakes={sortActive(cableMakeRows, (row) => row.name)}
            banks={sortActive(bankRows, (row) => row.name)}
            sizes={sortActive(sizes, (row) => row.label)}
            discoms={discoms}
            zones={zones}
          />
        </section>

        <TemplateList templates={templates} />
      </div>
    </main>
  );
}

function Catalog({
  cat,
  companies,
  types,
  models,
  inverters,
  structures,
  cableMakes,
  banks: bankRows,
  sizes,
  discoms,
  zones,
}: {
  cat: MasterCategory;
  companies: { id: number; name: string; active: boolean }[];
  types: { id: number; name: string; active: boolean }[];
  models: { id: number; modelNo: string; wattPeak: number; isDcr: boolean; active: boolean; company: string }[];
  inverters: { id: number; manufacturer: string; modelNo: string; capacityKw: string; active: boolean }[];
  structures: { id: number; name: string; active: boolean }[];
  cableMakes: { id: number; name: string; active: boolean }[];
  banks: { id: number; name: string; active: boolean }[];
  sizes: { id: number; label: string; kw: string; active: boolean }[];
  discoms: {
    id: number;
    code: string;
    name: string;
    nameChangeUrl: string | null;
    loadEnhancementUrl: string | null;
    meterPortalUrl: string | null;
    landRecordsUrl: string | null;
  }[];
  zones: { id: number; name: string; division: string; circle: string; region: string; companyId: number }[];
}) {
  if (cat === "panel-models") {
    return (
      <List empty="No panel models yet.">
        {models.map((row) => (
          <Row key={row.id} muted={!row.active}>
            <div className="min-w-0 flex-[1_1_170px]">
              <div className="text-sm font-semibold">{row.modelNo}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{row.company}</div>
            </div>
            <span className="ref shrink-0 text-[13px] text-[var(--muted)]">{row.wattPeak} W</span>
            <span
              className={`inline-block shrink-0 rounded-full px-[9px] py-[3px] text-[10.5px] font-bold ${
                row.isDcr ? "bg-[var(--green-soft)] text-[var(--green-text)]" : "bg-[var(--chip-soft)] text-[var(--chip-text)]"
              }`}
            >
              {row.isDcr ? "DCR" : "Non-DCR"}
            </span>
            <RetireButton category="panel-models" id={row.id} active={row.active} />
          </Row>
        ))}
      </List>
    );
  }

  if (
    cat === "panel-companies" ||
    cat === "panel-types" ||
    cat === "structures" ||
    cat === "cable-makes" ||
    cat === "banks"
  ) {
    const rows =
      cat === "panel-companies"
        ? companies
        : cat === "panel-types"
          ? types
          : cat === "structures"
            ? structures
            : cat === "cable-makes"
              ? cableMakes
              : bankRows;
    return (
      <List empty="Nothing in this list yet.">
        {rows.map((row) => (
          <Row key={row.id} muted={!row.active}>
            <div className="min-w-0 flex-1 text-sm font-semibold">{row.name}</div>
            {!row.active ? <Retired /> : null}
            <RetireButton category={cat} id={row.id} active={row.active} />
          </Row>
        ))}
      </List>
    );
  }

  if (cat === "inverters") {
    return (
      <List empty="No inverter models yet.">
        {inverters.map((row) => (
          <Row key={row.id} muted={!row.active}>
            <div className="min-w-0 flex-[1_1_170px]">
              <div className="text-sm font-semibold">{row.modelNo}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{row.manufacturer}</div>
            </div>
            <span className="ref shrink-0 text-[13px] text-[var(--muted)]">{kwLabel(row.capacityKw)}</span>
            <RetireButton category="inverters" id={row.id} active={row.active} />
          </Row>
        ))}
      </List>
    );
  }

  if (cat === "plant-sizes") {
    return (
      <List empty="No plant sizes yet.">
        {sizes.map((row) => (
          <Row key={row.id} muted={!row.active}>
            <div className="min-w-0 flex-1 text-sm font-semibold">{row.label}</div>
            <span className="ref shrink-0 text-[13px] text-[var(--muted)]">{kwLabel(row.kw)}</span>
            <RetireButton category="plant-sizes" id={row.id} active={row.active} />
          </Row>
        ))}
      </List>
    );
  }

  return (
    <div>
      {discoms.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--muted)]">No DISCOM has been added yet.</p>
      ) : (
        discoms.map((company) => {
          const own = zones.filter((zone) => zone.companyId === company.id);
          return (
            <div key={company.id} className="border-b border-[var(--line-soft)] px-5 py-4">
              <div className="text-sm font-semibold">{company.name}</div>
              <div className="ref mt-0.5 text-xs text-[var(--muted)]">{company.code}</div>
              <p className="mt-2 mb-0 text-[12.5px] text-[var(--muted)]">
                These addresses are what the name-change and load flags link to. A new zone does not need a deploy.
              </p>
              <DiscomLinksForm company={company} />
              <div className="mt-4">
                {own.length === 0 ? (
                  <p className="text-[13px] text-[var(--muted)]">No zones under this company yet.</p>
                ) : (
                  own.map((zone) => (
                    <div key={zone.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--line-soft)] py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{zone.name}</div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">
                          {zone.division} · {zone.circle} · {zone.region}
                        </div>
                      </div>
                      <RemoveZoneButton id={zone.id} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function List({ empty, children }: { empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  if (items.length === 0) return <p className="px-5 py-8 text-sm text-[var(--muted)]">{empty}</p>;
  return <>{children}</>;
}

function Row({ muted, children }: { muted?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-5 py-[13px] ${muted ? "opacity-60" : ""}`}>
      {children}
    </div>
  );
}

function Retired() {
  return (
    <span className="inline-block rounded-full bg-[var(--chip-soft)] px-[9px] py-[3px] text-[10.5px] font-bold text-[var(--chip-text)]">
      Retired
    </span>
  );
}
