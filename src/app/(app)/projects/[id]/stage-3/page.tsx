import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  batteryBanks,
  batterySerials,
  contacts,
  documents as documentsTable,
  installations,
  panelSerials,
  projects,
  structureMembers,
} from "@/lib/db/schema";
import { InstallationForm } from "@/components/installation/installation-form";
import { BatteryBank, PanelSerials } from "@/components/installation/serial-list";
import { StructureMembers } from "@/components/installation/structure-members";
import { loadInstallationComboOptions } from "@/lib/installer/combo-options";
import { installerIdsFor } from "@/lib/projects/crew";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function Stage3Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) notFound();

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  // Installers only reach their own jobs.
  if (
    !can(actor, "installation.write", {
      assignedEmployeeId: row.project.assignedEmployeeId,
      assignedInstallerIds: await installerIdsFor(id),
    })
  ) {
    notFound();
  }

  const [install] = await db.select().from(installations).where(eq(installations.projectId, id)).limit(1);
  const comboOptions = await loadInstallationComboOptions();
  const serials = await db
    .select()
    .from(panelSerials)
    .where(eq(panelSerials.projectId, id))
    .orderBy(asc(panelSerials.sortOrder));
  const members = await db
    .select()
    .from(structureMembers)
    .where(eq(structureMembers.projectId, id))
    .orderBy(asc(structureMembers.sortOrder));
  const [battery] = await db.select().from(batteryBanks).where(eq(batteryBanks.projectId, id)).limit(1);
  const cells = await db
    .select()
    .from(batterySerials)
    .where(eq(batterySerials.projectId, id))
    .orderBy(asc(batterySerials.sortOrder));

  const agreementSigned = (
    await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)))
  ).some((d) => d.docType === "AGREEMENT_SIGNED");

  const isHybrid = install?.isHybrid ?? false;

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/projects" className="no-underline">Projects</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <Link href={`/projects/${id}`} className="ref no-underline">{row.project.code}</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span>Stage 3</span>
      </nav>

      <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Installation</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        {row.contact.firstName} {row.contact.lastName ?? ""} · everything here prints into the work
        completion report, so it is recorded as the DISCOM wants to read it.
      </p>

      {!agreementSigned ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <span className="min-w-60 flex-1">
            <strong className="block text-sm font-bold text-[var(--amber-text)]">
              No signed agreement on file
            </strong>
            <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
              Work normally starts after both parties have signed. You can record the installation
              either way, but the signed scan has to reach stage 2 before this project can close.
            </span>
          </span>
          <Link
            href={`/projects/${id}/stage-2`}
            className="inline-flex h-11 shrink-0 items-center rounded-lg border border-[var(--orange)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--orange-text)] no-underline"
          >
            Go to stage 2
          </Link>
        </div>
      ) : null}

      <div className="space-y-4.5">
        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <InstallationForm
            projectId={id}
            initial={{
              installationDate: str(install?.installationDate),
              panelCompany: str(install?.panelCompany),
              panelModelNo: str(install?.panelModelNo),
              panelWattPeak: str(install?.panelWattPeak),
              totalPanels: str(install?.totalPanels),
              totalCapacityKw: str(install?.totalCapacityKw),
              inverterManufacturer: str(install?.inverterManufacturer),
              inverterModelNo: str(install?.inverterModelNo),
              inverterSerial: str(install?.inverterSerial),
              inverterCapacityKw: str(install?.inverterCapacityKw),
              inverterCount: str(install?.inverterCount ?? 1),
              inverterPhase: (install?.inverterPhase ?? "") as "SINGLE" | "THREE" | "",
              isHybrid,
              acdbMake: str(install?.acdbMake),
              acdbSizeType: str(install?.acdbSizeType),
              acdbSpd: str(install?.acdbSpd),
              acdbMcb: str(install?.acdbMcb),
              dcdbMake: str(install?.dcdbMake),
              dcdbSizeType: str(install?.dcdbSizeType),
              dcdbSpd: str(install?.dcdbSpd),
              dcdbMcb: str(install?.dcdbMcb),
            }}
            comboOptions={comboOptions}
          />
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <StructureMembers
            projectId={id}
            initial={members.map((m) => ({
              memberType: m.memberType,
              size: str(m.size),
              lengthM: str(m.lengthM),
              quantity: str(m.quantity),
            }))}
            initialCompany={str(install?.structureCompany)}
            initialLegCount={str(install?.legCount)}
          />
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <PanelSerials
            projectId={id}
            initial={serials.map((s) => s.serialNo)}
            expected={install?.totalPanels ?? 0}
          />
        </section>

        {isHybrid ? (
          <BatteryBank
            projectId={id}
            initial={{
              manufacturer: str(battery?.manufacturer),
              batteryType: str(battery?.batteryType),
              cellCapacity: str(battery?.cellCapacity),
              seriesCount: str(battery?.seriesCount),
              parallelCount: str(battery?.parallelCount),
              totalCapacity: str(battery?.totalCapacity),
              totalVoltage: str(battery?.totalVoltage),
              serials: cells.map((c) => c.serialNo),
            }}
          />
        ) : null}
      </div>

      <Link
        href={`/projects/${id}`}
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
      >
        Back to the stage gate
      </Link>
    </main>
  );
}
