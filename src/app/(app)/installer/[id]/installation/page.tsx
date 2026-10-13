import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getPhotoThumbUrls } from "@/app/actions/photos";
import { PhotoGrid } from "@/components/documents/photo-grid";
import { BackLink, FieldSection, PageTitle, StatePill } from "@/components/installer/job-chrome";
import { InstallationForm } from "@/components/installation/installation-form";
import { EarthingForm, MaterialForm } from "@/components/installation/material-form";
import { BatteryBank, PanelSerials } from "@/components/installation/serial-list";
import { StructureMembers } from "@/components/installation/structure-members";
import { db } from "@/lib/db";
import {
  batteryBanks,
  batterySerials,
  cableMakes,
  earthingRecords,
  installations,
  materialConsumption,
  panelSerials,
  structureMembers,
} from "@/lib/db/schema";
import { loadInstallationComboOptions } from "@/lib/installer/combo-options";
import { customerName, loadJob } from "@/lib/installer/job";
import { PHOTO_LABELS, REQUIRED_PHOTO_TYPES } from "@/lib/workflow/photo-requirements";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * Post-installation details — the second and last thing an installer fills.
 *
 * Stage 3 and stage 4 are one screen here on purpose: on site they are one
 * visit, and an installer should not have to learn the office's stage numbers
 * to find the rest of the form. Every section saves on its own, so a phone
 * that drops signal half way down does not lose what was already entered.
 */
export default async function InstallerInstallationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await loadJob(id, "installation.write");
  if (!job) notFound();

  const [install] = await db
    .select()
    .from(installations)
    .where(eq(installations.projectId, id))
    .limit(1);
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
  const [battery] = await db
    .select()
    .from(batteryBanks)
    .where(eq(batteryBanks.projectId, id))
    .limit(1);
  const cells = await db
    .select()
    .from(batterySerials)
    .where(eq(batterySerials.projectId, id))
    .orderBy(asc(batterySerials.sortOrder));
  const material = await db
    .select()
    .from(materialConsumption)
    .where(eq(materialConsumption.projectId, id))
    .orderBy(asc(materialConsumption.sortOrder));
  const [earthing] = await db
    .select()
    .from(earthingRecords)
    .where(eq(earthingRecords.projectId, id))
    .limit(1);
  const cableMakeRows = await db
    .select({ name: cableMakes.name })
    .from(cableMakes)
    .where(eq(cableMakes.active, true))
    .orderBy(asc(cableMakes.name));

  const galleries = await Promise.all(
    REQUIRED_PHOTO_TYPES.map(async (type) => ({ type, photos: await getPhotoThumbUrls(id, type) })),
  );
  const covered = galleries.filter((g) => g.photos.length > 0).length;
  const isHybrid = install?.isHybrid ?? false;

  return (
    <main className="mx-auto max-w-[640px] px-4 pt-2 pb-12">
      <BackLink href={`/installer/${id}`} label={customerName(job.contact)} />
      <PageTitle
        title="Post-installation details"
        sub="Everything here prints into the work completion report, so record it the way the DISCOM reads it."
      />

      <div className="space-y-3">
        <FieldSection>
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
        </FieldSection>

        <FieldSection>
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
        </FieldSection>

        <FieldSection>
          <PanelSerials
            projectId={id}
            initial={serials.map((s) => s.serialNo)}
            expected={install?.totalPanels ?? 0}
          />
        </FieldSection>

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

        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
          <div className="mb-0.5 flex items-start gap-2.5">
            <h2 className="min-w-0 flex-1 text-[16px] font-bold">Required photographs</h2>
            <StatePill state={covered >= REQUIRED_PHOTO_TYPES.length ? "done" : "part"}>
              {covered}/{REQUIRED_PHOTO_TYPES.length}
            </StatePill>
          </div>
          <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--muted)]">
            Six distinct shots — six copies of one of them will not do. Keep location switched on
            and the coordinates are burned into the corner of each image, which is what the portal
            wants to see.
          </p>

          <div className="space-y-3">
            {galleries.map(({ type, photos }) => (
              <div
                key={type}
                className={`rounded-[9px] border p-3 ${
                  photos.length
                    ? "border-[var(--line)] bg-[var(--surface-2)]"
                    : "border-[var(--amber-border)] bg-[var(--amber-surface)]"
                }`}
              >
                <PhotoGrid
                  projectId={id}
                  photoType={type}
                  label={PHOTO_LABELS[type].label}
                  hint={PHOTO_LABELS[type].hint}
                  photos={photos}
                />
              </div>
            ))}
          </div>
        </section>

        <FieldSection>
          <MaterialForm
            projectId={id}
            initial={material.map((m) => ({
              category: m.category,
              make: str(m.make),
              lengthM: str(m.lengthM),
              sizeSqmm: str(m.sizeSqmm),
              coreType: str(m.coreType),
              conductor: str(m.conductor),
            }))}
            cableMakeOptions={cableMakeRows.map((r) => r.name)}
          />
        </FieldSection>

        <FieldSection>
          <EarthingForm
            projectId={id}
            initial={{
              resistanceOhms: str(earthing?.resistanceOhms),
              wireSize: str(earthing?.wireSize),
              wireType: str(earthing?.wireType),
              twoSeparatePoints: earthing?.twoSeparatePoints ?? false,
              cautionSignage: earthing?.cautionSignage ?? false,
              omManualProvided: earthing?.omManualProvided ?? false,
            }}
          />
        </FieldSection>
      </div>
    </main>
  );
}
