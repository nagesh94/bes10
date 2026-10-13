"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  applicationDetails,
  auditLog,
  bankAccounts,
  coApplicants,
  contacts,
  electricityConnections,
  flags,
  identityAadhaar,
  identityPan,
  otherDetails,
  projects,
  rooftopDetails,
  siteSurveys,
} from "@/lib/db/schema";
import { deriveFlags, type NameEntry } from "@/lib/flags/engine";
import { installerIdsFor } from "@/lib/projects/crew";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import {
  isSectionComplete,
  sectionSchemas,
  type ConditionalSectionKey,
  type SectionKey,
} from "@/lib/validation/prospect";

export type SaveResult =
  | { ok: true; complete: boolean; flagCount: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const nullIfBlank = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : (s as string | null);
};

export async function saveSection(
  projectId: string,
  section: SectionKey | ConditionalSectionKey,
  raw: Record<string, unknown>,
): Promise<SaveResult> {
  const actor = await getActor();

  // The site survey is field work: whoever goes to the roof fills it in,
  // including an installer, on a job assigned to them. Every other section is
  // office work and stays with the staff who run the pipeline.
  if (section === "survey") {
    const [owner] = await db
      .select({ assignedEmployeeId: projects.assignedEmployeeId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!owner) return { ok: false, error: "That project no longer exists." };
    assertCan(actor, "survey.write", {
      assignedEmployeeId: owner.assignedEmployeeId,
      assignedInstallerIds: await installerIdsFor(projectId),
    });
  } else {
    assertCan(actor, "prospect.write");
  }

  const schema = sectionSchemas[section];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const values = parsed.data as Record<string, unknown>;
  const complete = isSectionComplete(section, values);
  const completedAt = complete ? new Date() : null;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };

  await db.transaction(async (tx) => {
    switch (section) {
      case "user": {
        const v = values as Record<string, string | boolean>;
        await tx
          .update(contacts)
          .set({
            firstName: v.firstName as string,
            lastName: nullIfBlank(v.lastName),
            gender: nullIfBlank(v.gender),
            phone: v.phone as string,
            email: nullIfBlank(v.email),
            address: nullIfBlank(v.address),
            pinCode: nullIfBlank(v.pinCode),
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, project.contactId));

        await tx
          .insert(applicationDetails)
          .values({
            projectId,
            nationalPortalId: nullIfBlank(v.nationalPortalId),
            applicationDate: nullIfBlank(v.applicationDate),
            regionName: nullIfBlank(v.regionName),
            circleName: nullIfBlank(v.circleName),
            divisionName: nullIfBlank(v.divisionName),
            zoneName: nullIfBlank(v.zoneName),
            isDcr: Boolean(v.isDcr),
            wantsSubsidy: Boolean(v.wantsSubsidy),
            completedAt,
          })
          .onConflictDoUpdate({
            target: applicationDetails.projectId,
            set: {
              nationalPortalId: nullIfBlank(v.nationalPortalId),
              applicationDate: nullIfBlank(v.applicationDate),
              regionName: nullIfBlank(v.regionName),
              circleName: nullIfBlank(v.circleName),
              divisionName: nullIfBlank(v.divisionName),
              zoneName: nullIfBlank(v.zoneName),
              isDcr: Boolean(v.isDcr),
              wantsSubsidy: Boolean(v.wantsSubsidy),
              completedAt,
            },
          });
        break;
      }

      case "rooftop": {
        const v = values as Record<string, string>;
        const set = {
          plantKw: nullIfBlank(v.plantKw),
          latitude: nullIfBlank(v.latitude),
          longitude: nullIfBlank(v.longitude),
          completedAt,
        };
        await tx
          .insert(rooftopDetails)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: rooftopDetails.projectId, set });
        break;
      }

      case "aadhaar": {
        const v = values as Record<string, string>;
        // The number itself is no longer collected. aadhaarLast4/aadhaarEncrypted
        // are left out of `set` entirely so a legacy record (saved before this
        // policy changed) is never touched by a later save of this section.
        const set = {
          nameOnAadhaar: nullIfBlank(v.nameOnAadhaar),
          addressOnAadhaar: nullIfBlank(v.addressOnAadhaar),
          completedAt,
        };
        await tx
          .insert(identityAadhaar)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: identityAadhaar.projectId, set });
        break;
      }

      case "pan": {
        const v = values as Record<string, string>;
        const set = {
          nameOnPan: nullIfBlank(v.nameOnPan),
          panNumber: v.panNumber ? v.panNumber.toUpperCase() : null,
          completedAt,
        };
        await tx
          .insert(identityPan)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: identityPan.projectId, set });
        break;
      }

      case "bank": {
        const v = values as Record<string, string | boolean>;
        const set = {
          bankName: nullIfBlank(v.bankName),
          accountHolderName: nullIfBlank(v.accountHolderName),
          accountNumber: nullIfBlank(v.accountNumber),
          ifscCode: typeof v.ifscCode === "string" && v.ifscCode ? v.ifscCode.toUpperCase() : null,
          occupation: nullIfBlank(v.occupation),
          hasCoApplicant: Boolean(v.hasCoApplicant),
          completedAt,
        };
        await tx
          .insert(bankAccounts)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: bankAccounts.projectId, set });

        // Turning the co-applicant off clears their details rather than
        // leaving a hidden row that would still reach the bank file.
        if (!set.hasCoApplicant) {
          await tx.delete(coApplicants).where(eq(coApplicants.projectId, projectId));
        }
        break;
      }

      case "coApplicant": {
        const v = values as Record<string, string>;
        // Same policy as the main applicant: the Aadhaar number is never
        // collected, so aadhaarLast4/aadhaarEncrypted are left untouched here.
        const set = {
          name: nullIfBlank(v.name),
          relationship: nullIfBlank(v.relationship),
          phone: nullIfBlank(v.phone),
          email: nullIfBlank(v.email),
          occupation: nullIfBlank(v.occupation),
          panNumber: v.panNumber ? v.panNumber.toUpperCase() : null,
          completedAt,
        };
        await tx
          .insert(coApplicants)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: coApplicants.projectId, set });
        break;
      }

      case "electricity": {
        const v = values as Record<string, string>;
        const set = {
          consumerNumber: nullIfBlank(v.consumerNumber),
          nameOnBill: nullIfBlank(v.nameOnBill),
          sanctionedLoadKw: nullIfBlank(v.sanctionedLoadKw),
          currentBillAmount: nullIfBlank(v.currentBillAmount),
          completedAt,
        };
        await tx
          .insert(electricityConnections)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: electricityConnections.projectId, set });
        break;
      }

      case "other": {
        const v = values as Record<string, string>;
        const set = {
          panelType: nullIfBlank(v.panelType),
          panelCompany: nullIfBlank(v.panelCompany),
          meterType: nullIfBlank(v.meterType),
          completedAt,
        };
        await tx
          .insert(otherDetails)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: otherDetails.projectId, set });
        break;
      }

      case "survey": {
        const v = values as Record<string, string>;
        const set = {
          acCableLengthM: nullIfBlank(v.acCableLengthM),
          dcCableLengthM: nullIfBlank(v.dcCableLengthM),
          earthingLengthM: nullIfBlank(v.earthingLengthM),
          laLengthM: nullIfBlank(v.laLengthM),
          pipesRequired: v.pipesRequired ? Number(v.pipesRequired) : null,
          completedAt,
        };
        await tx
          .insert(siteSurveys)
          .values({ projectId, ...set })
          .onConflictDoUpdate({ target: siteSurveys.projectId, set });
        break;
      }
    }

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: `prospect.save.${section}`,
      entityType: "project",
      entityId: projectId,
      projectId,
      // The Aadhaar number never goes into the audit payload.
      after: section === "aadhaar" ? { completed: complete } : { completed: complete, ...values },
    });
  });

  const flagCount = await recomputeFlags(projectId);

  revalidatePath(`/projects/${projectId}/stage-1`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/installer/${projectId}/survey`);
  revalidatePath(`/installer/${projectId}`);
  revalidatePath("/installer");
  return { ok: true, complete, flagCount };
}

/**
 * Re-derives both flags from whatever is currently on the project.
 *
 * Runs after every section save, so a flag appears the moment the data that
 * triggers it is entered, and clears itself when the data is corrected. A
 * flag an admin has already waived is left alone.
 */
export async function recomputeFlags(projectId: string): Promise<number> {
  const [aadhaar] = await db
    .select()
    .from(identityAadhaar)
    .where(eq(identityAadhaar.projectId, projectId))
    .limit(1);
  const [pan] = await db.select().from(identityPan).where(eq(identityPan.projectId, projectId)).limit(1);
  const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.projectId, projectId)).limit(1);
  const [bill] = await db
    .select()
    .from(electricityConnections)
    .where(eq(electricityConnections.projectId, projectId))
    .limit(1);
  const [roof] = await db.select().from(rooftopDetails).where(eq(rooftopDetails.projectId, projectId)).limit(1);

  const names: NameEntry[] = [
    { source: "AADHAAR", name: aadhaar?.nameOnAadhaar ?? "" },
    { source: "PAN", name: pan?.nameOnPan ?? "" },
    { source: "BANK", name: bank?.accountHolderName ?? "" },
    { source: "BILL", name: bill?.nameOnBill ?? "" },
  ];

  const derived = deriveFlags({
    names,
    plantKw: roof?.plantKw ? Number(roof.plantKw) : null,
    sanctionedKw: bill?.sanctionedLoadKw ? Number(bill.sanctionedLoadKw) : null,
  });

  const existing = await db.select().from(flags).where(eq(flags.projectId, projectId));

  for (const flag of derived) {
    const match = existing.find((e) => e.type === flag.type);
    if (!match) {
      await db.insert(flags).values({
        projectId,
        type: flag.type,
        status: "OPEN",
        detail: JSON.stringify(flag.detail),
      });
    } else if (match.status !== "WAIVED" && match.status !== "RESOLVED") {
      await db
        .update(flags)
        .set({ detail: JSON.stringify(flag.detail) })
        .where(eq(flags.id, match.id));
    }
  }

  // A flag whose cause has gone resolves itself — a corrected bill name should
  // not leave a stale warning sitting on the project.
  for (const row of existing) {
    const stillDerived = derived.some((d) => d.type === row.type);
    if (!stillDerived && row.status === "OPEN") {
      await db
        .update(flags)
        .set({ status: "RESOLVED", resolvedAt: new Date() })
        .where(and(eq(flags.id, row.id), eq(flags.status, "OPEN")));
    }
  }

  const open = await db.select().from(flags).where(eq(flags.projectId, projectId));
  return open.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;
}
