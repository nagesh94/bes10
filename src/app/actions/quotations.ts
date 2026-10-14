"use server";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  auditLog,
  companyBranches,
  contacts,
  documents,
  projects,
  quotationItems,
  quotationMilestones,
  quotationScopeOverrides,
  quotations,
} from "@/lib/db/schema";
import { writeAudit } from "@/lib/admin/write-audit";
import { newId } from "@/lib/projects/code";
import { SCOPE_ROWS, type ScopeRow } from "@/lib/quotations/content";
import { nextQuotationNumber } from "@/lib/quotations/number";
import { buildQuotationPdf, type QuotationDoc } from "@/lib/quotations/pdf";
import { assertCan, can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { quotationKey } from "@/lib/storage/client";
import { fileHref } from "@/lib/storage/file-url";
import { deleteDocumentObject, ensureBuckets, putDocument } from "@/lib/storage/operations";
import {
  quotationChooseSchema,
  quotationLinkSchema,
  quotationSchema,
  quotationStatusSchema,
  type QuotationInput,
} from "@/lib/validation/quotation";

/**
 * The quotation maker.
 *
 * Two things here are worth knowing before changing anything.
 *
 * First, the number is allocated inside the same transaction that writes the
 * row, and only on create. An edit re-renders the PDF but keeps the number:
 * the customer may already be holding a sheet of paper with it on.
 *
 * Second, everything that prints is copied onto the quotation row at save
 * time — the letterhead, the bank details, the consumer's name. Regenerating
 * a two-year-old quotation after the company has moved office must produce
 * the old office's address, because that is the offer that was made.
 */

export type QuotationResult =
  | { ok: true; id: string; number: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const PDF_MIME = "application/pdf";

/**
 * One quotation, as long as it has not been deleted.
 *
 * Deleting leaves the row in place — the number has to stay answerable, see
 * the schema — so every lookup by id goes through this rather than matching
 * the id alone. A deleted quotation then simply reads as "no longer exists",
 * which is what each caller already says.
 */
function live(id: string) {
  return and(eq(quotations.id, id), isNull(quotations.deletedAt));
}

function fieldErrorsOf(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/** Only rows that differ from the standard scope are stored. */
function scopeOverridesFrom(
  input: QuotationInput,
): Array<{ rowKey: string; byBhim: boolean; byCustomer: boolean }> {
  return input.scope
    .filter((row) => {
      const standard = SCOPE_ROWS.find((s) => s.key === row.key);
      return standard && (standard.byBhim !== row.byBhim || standard.byCustomer !== row.byCustomer);
    })
    .map((row) => ({ rowKey: row.key, byBhim: row.byBhim, byCustomer: row.byCustomer }));
}

function scopeWithOverrides(
  overrides: Array<{ rowKey: string; byBhim: boolean; byCustomer: boolean }>,
): ScopeRow[] {
  return SCOPE_ROWS.map((row) => {
    const override = overrides.find((o) => o.rowKey === row.key);
    return override ? { ...row, byBhim: override.byBhim, byCustomer: override.byCustomer } : row;
  });
}

/**
 * Renders the PDF, stores it, and files it against the project when there is
 * one.
 *
 * Called on create and on every edit. Failing to render must not lose the
 * quotation — the row is already written by this point — so the caller
 * treats a render failure as a warning and the quotation keeps its number
 * with no file attached, ready to be generated again.
 */
async function renderAndStore(quotationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db.select().from(quotations).where(live(quotationId)).limit(1);
  if (!row) return { ok: false, error: "That quotation no longer exists." };

  const [items, milestones, overrides] = await Promise.all([
    db
      .select()
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, quotationId))
      .orderBy(asc(quotationItems.sortOrder)),
    db
      .select()
      .from(quotationMilestones)
      .where(eq(quotationMilestones.quotationId, quotationId))
      .orderBy(asc(quotationMilestones.sortOrder)),
    db
      .select()
      .from(quotationScopeOverrides)
      .where(eq(quotationScopeOverrides.quotationId, quotationId)),
  ]);

  const data: QuotationDoc = {
    number: row.number,
    // A `date` column comes back as "2026-06-15"; parsed as local midnight so
    // the printed day never slips a day backwards in IST.
    date: new Date(`${row.quotationDate}T00:00:00`),
    consumer: {
      title: row.consumerTitle,
      name: row.consumerName,
      address: row.consumerAddress,
      phone: row.consumerPhone,
    },
    capacityKwp: Number(row.capacityKwp),
    systemType: row.systemType,
    meteringPolicy: row.meteringPolicy,
    totalAmount: Number(row.totalAmount),
    vendor: {
      name: row.vendorName,
      address: row.vendorAddress,
      phones: row.vendorPhones,
      email: row.vendorEmail,
      gstin: row.vendorGstin,
    },
    bank: {
      name: row.bankName,
      accountNo: row.bankAccountNo,
      ifsc: row.bankIfsc,
      accountType: row.bankAccountType,
    },
    signatoryName: row.signatoryName,
    notes: row.notes,
    scope: scopeWithOverrides(overrides),
    items: items.map((i) => ({
      description: i.description,
      qty: i.qty ?? "",
      make: i.make ?? "",
      remark: i.remark ?? "",
    })),
    milestones: milestones.map((m) => ({ label: m.label, schedule: m.schedule })),
  };

  let pdf: Buffer;
  try {
    pdf = await buildQuotationPdf(data);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The quotation PDF could not be built.",
    };
  }

  const fileName = `Quotation-${row.number}-${row.consumerName.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  const key = quotationKey(row.number, fileName);

  await ensureBuckets();
  await putDocument(key, pdf, PDF_MIME);

  await db
    .update(quotations)
    .set({
      s3Key: key,
      fileName,
      sizeBytes: pdf.length,
      pdfGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, quotationId));

  await syncFiledDocument(quotationId);

  return { ok: true };
}

/**
 * Keeps the project's filed `QUOTATION` document in step with this one.
 *
 * A project may carry several quotations — 3 kW against 5 kW, with and
 * without a battery — but only the chosen one is the offer, so only the
 * chosen one is filed. That matters beyond tidiness: the bank loan pack
 * prints a single quotation slot and the stage gate counts a single
 * document, and either would otherwise pick whichever was saved last.
 *
 * So this files when the quotation is both attached and chosen, and removes
 * its filed copy when it is neither. The S3 object is never deleted — the
 * quotation's own `s3Key` still points at it, so re-choosing re-files from
 * it without rendering again.
 */
async function syncFiledDocument(quotationId: string): Promise<void> {
  const [row] = await db
    .select({
      projectId: quotations.projectId,
      documentId: quotations.documentId,
      isChosen: quotations.isChosen,
      s3Key: quotations.s3Key,
      fileName: quotations.fileName,
      sizeBytes: quotations.sizeBytes,
    })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  if (!row) return;

  const shouldFile = Boolean(row.projectId && row.isChosen && row.s3Key);

  if (!shouldFile) {
    if (row.documentId) {
      await db.delete(documents).where(eq(documents.id, row.documentId));
      await db.update(quotations).set({ documentId: null }).where(eq(quotations.id, quotationId));
    }
    return;
  }

  const values = {
    projectId: row.projectId!,
    docType: "QUOTATION",
    docClass: "GENERATED" as const,
    status: "GENERATED" as const,
    fileName: row.fileName,
    mimeType: PDF_MIME,
    sizeBytes: row.sizeBytes,
    s3KeyOriginal: row.s3Key,
    // A generated PDF is already small; the portal copy is the same object.
    s3KeyPortal: row.s3Key,
    generatedAt: new Date(),
  };

  if (row.documentId) {
    await db.update(documents).set(values).where(eq(documents.id, row.documentId));
  } else {
    const documentId = newId("doc");
    await db.insert(documents).values({ id: documentId, ...values });
    await db.update(quotations).set({ documentId }).where(eq(quotations.id, quotationId));
  }
}

export async function createQuotation(raw: QuotationInput): Promise<QuotationResult> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const parsed = quotationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const input = parsed.data;

  const [branch] = await db
    .select()
    .from(companyBranches)
    .where(eq(companyBranches.isDefault, true))
    .limit(1);
  if (!branch) {
    return { ok: false, error: "No company branch is set up. Add one under Admin first." };
  }

  // A quotation raised from a project must actually belong to one.
  if (input.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!project) return { ok: false, error: "That project no longer exists." };
  }

  const id = newId("quo");

  const number = await db.transaction(async (tx) => {
    const number = await nextQuotationNumber(tx as unknown as typeof db);

    // The first quotation on a project is the offer by default; a later one
    // joins as an alternative, because which of several is the deal is a
    // decision only a person can make.
    const chosen = input.projectId
      ? !(await hasChosen(tx as unknown as typeof db, input.projectId))
      : false;

    await tx.insert(quotations).values({
      id,
      number,
      projectId: input.projectId || null,
      isChosen: chosen,
      status: "DRAFT",
      quotationDate: input.quotationDate,
      consumerTitle: input.consumerTitle || null,
      consumerName: input.consumerName,
      consumerAddress: input.consumerAddress || null,
      consumerPhone: input.consumerPhone || null,
      capacityKwp: String(input.capacityKwp),
      systemType: input.systemType,
      meteringPolicy: input.meteringPolicy,
      totalAmount: String(input.totalAmount),
      structureMake: input.structureMake || null,
      panelCompany: input.panelCompany || null,
      panelModel: input.panelModel || null,
      panelWattPeak: input.panelWattPeak ?? null,
      panelCount: input.panelCount ?? null,
      inverterMake: input.inverterMake || null,
      inverterModel: input.inverterModel || null,
      branchId: branch.id,
      vendorName: branch.companyName,
      vendorAddress: `${branch.addressLine}, ${branch.city} ${branch.pinCode}`.trim(),
      vendorPhones: branch.phones,
      vendorEmail: branch.email,
      vendorGstin: branch.gstin,
      signatoryName: branch.signatoryName,
      bankName: branch.bankName,
      bankAccountNo: branch.bankAccountNo,
      bankIfsc: branch.bankIfsc,
      bankAccountType: branch.bankAccountType,
      notes: input.notes || null,
      createdBy: actor.id,
    });

    await writeChildren(tx as unknown as typeof db, id, input);

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "quotation.create",
      entityType: "quotation",
      entityId: id,
      projectId: input.projectId || null,
      after: {
        number,
        consumer: input.consumerName,
        capacityKwp: input.capacityKwp,
        totalAmount: input.totalAmount,
      },
    });

    return number;
  });

  const rendered = await renderAndStore(id);

  revalidatePath("/quotations");
  if (input.projectId) revalidatePath(`/projects/${input.projectId}`);

  if (!rendered.ok) {
    return {
      ok: false,
      error: `${number} was saved, but the PDF could not be built: ${rendered.error}`,
    };
  }
  return { ok: true, id, number };
}

export async function updateQuotation(
  id: string,
  raw: QuotationInput,
): Promise<QuotationResult> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const parsed = quotationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const input = parsed.data;

  const [existing] = await db.select().from(quotations).where(live(id)).limit(1);
  if (!existing) return { ok: false, error: "That quotation no longer exists." };

  await db.transaction(async (tx) => {
    await tx
      .update(quotations)
      .set({
        quotationDate: input.quotationDate,
        consumerTitle: input.consumerTitle || null,
        consumerName: input.consumerName,
        consumerAddress: input.consumerAddress || null,
        consumerPhone: input.consumerPhone || null,
        capacityKwp: String(input.capacityKwp),
        systemType: input.systemType,
        meteringPolicy: input.meteringPolicy,
        totalAmount: String(input.totalAmount),
        structureMake: input.structureMake || null,
        panelCompany: input.panelCompany || null,
        panelModel: input.panelModel || null,
        panelWattPeak: input.panelWattPeak ?? null,
        panelCount: input.panelCount ?? null,
        inverterMake: input.inverterMake || null,
        inverterModel: input.inverterModel || null,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, id));

    // The child rows are a list the form reorders freely, so they are
    // replaced rather than diffed. Nothing else points at their ids.
    await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
    await tx.delete(quotationMilestones).where(eq(quotationMilestones.quotationId, id));
    await tx.delete(quotationScopeOverrides).where(eq(quotationScopeOverrides.quotationId, id));
    await writeChildren(tx as unknown as typeof db, id, input);

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "quotation.update",
      entityType: "quotation",
      entityId: id,
      projectId: existing.projectId,
      before: {
        capacityKwp: Number(existing.capacityKwp),
        totalAmount: Number(existing.totalAmount),
        consumer: existing.consumerName,
      },
      after: {
        capacityKwp: input.capacityKwp,
        totalAmount: input.totalAmount,
        consumer: input.consumerName,
      },
    });
  });

  const rendered = await renderAndStore(id);

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);

  if (!rendered.ok) {
    return { ok: false, error: `Saved, but the PDF could not be rebuilt: ${rendered.error}` };
  }
  return { ok: true, id, number: existing.number };
}

async function writeChildren(
  tx: typeof db,
  quotationId: string,
  input: QuotationInput,
): Promise<void> {
  await tx.insert(quotationItems).values(
    input.items.map((item, index) => ({
      quotationId,
      sortOrder: index,
      description: item.description,
      qty: item.qty || null,
      make: item.make || null,
      remark: item.remark || null,
    })),
  );

  await tx.insert(quotationMilestones).values(
    input.milestones.map((m, index) => ({
      quotationId,
      sortOrder: index,
      label: m.label,
      schedule: m.schedule,
    })),
  );

  const overrides = scopeOverridesFrom(input);
  if (overrides.length) {
    await tx
      .insert(quotationScopeOverrides)
      .values(overrides.map((o) => ({ quotationId, ...o })));
  }
}

/** Rebuild the PDF without changing anything — after a branch detail changes. */
export async function regenerateQuotationPdf(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const result = await renderAndStore(id);
  revalidatePath(`/quotations/${id}`);
  return result;
}

export async function setQuotationStatus(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const parsed = quotationStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not a status this quotation can take." };

  const [existing] = await db
    .select({ status: quotations.status, projectId: quotations.projectId, number: quotations.number })
    .from(quotations)
    .where(live(parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "That quotation no longer exists." };

  await db
    .update(quotations)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(quotations.id, parsed.data.id));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "quotation.status",
    entityType: "quotation",
    entityId: parsed.data.id,
    projectId: existing.projectId,
    before: { status: existing.status },
    after: { status: parsed.data.status, number: existing.number },
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${parsed.data.id}`);
  return { ok: true };
}

/**
 * Whether a project already has a chosen quotation.
 *
 * Used to decide whether a newly attached one becomes the offer or joins as
 * an alternative: the first is unambiguous, a later one is a decision only a
 * person can make.
 */
async function hasChosen(
  tx: typeof db,
  projectId: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.projectId, projectId), eq(quotations.isChosen, true)))
    .limit(2);
  return rows.some((row) => row.id !== exceptId);
}

/**
 * Make this the project's chosen quotation.
 *
 * Switching is the point: a customer shown a 3 kW and a 5 kW quotation picks
 * one, and the project has to follow without the other being deleted — it is
 * the record of what else was offered, and they may switch back.
 *
 * The previous choice is stood down in the same transaction, because the
 * partial unique index would refuse two chosen quotations on one project and
 * is the thing actually guaranteeing a single price reaches the bank file.
 */
export async function chooseQuotation(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const parsed = quotationChooseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not a quotation that can be chosen." };

  const [row] = await db
    .select({
      projectId: quotations.projectId,
      isChosen: quotations.isChosen,
      number: quotations.number,
      s3Key: quotations.s3Key,
    })
    .from(quotations)
    .where(live(parsed.data.id))
    .limit(1);
  if (!row) return { ok: false, error: "That quotation no longer exists." };
  if (!row.projectId) {
    return {
      ok: false,
      error: "Attach this quotation to a project before choosing it — there is nothing to be the offer for.",
    };
  }
  if (row.isChosen) return { ok: true };

  // Whoever is standing down loses its filed copy, so collect it first.
  const previous = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.projectId, row.projectId), eq(quotations.isChosen, true)));

  await db.transaction(async (tx) => {
    for (const other of previous) {
      await tx.update(quotations).set({ isChosen: false }).where(eq(quotations.id, other.id));
    }
    await tx
      .update(quotations)
      .set({ isChosen: true, updatedAt: new Date() })
      .where(eq(quotations.id, parsed.data.id));

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "quotation.choose",
      entityType: "quotation",
      entityId: parsed.data.id,
      projectId: row.projectId,
      before: { chosen: previous.map((p) => p.id) },
      after: { chosen: parsed.data.id, number: row.number },
    });
  });

  // Un-file the ones stood down before filing the new one: the stale rows
  // must be gone before a fresh QUOTATION document appears, or the pack
  // would briefly see two.
  for (const other of previous) await syncFiledDocument(other.id);
  await syncFiledDocument(parsed.data.id);

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${parsed.data.id}`);
  revalidatePath(`/projects/${row.projectId}`);
  revalidatePath(`/projects/${row.projectId}/stage-2`);
  return { ok: true };
}

/**
 * Attach a quotation to a project, move it to another, or take it off one.
 *
 * This is the other half of raising one standalone. A walk-in is quoted at
 * the counter before there is anything to attach it to; when they say yes
 * and a lead is created, the quotation already in their hands has to join
 * it rather than be retyped under a new number.
 *
 * Attaching files the PDF into that project's document library as its
 * quotation, which is what puts it in the bank loan pack. Detaching — or
 * moving to another project — removes the row this quotation filed, and
 * only that row: a quotation someone uploaded by hand against the same
 * project is a different document and is left alone.
 *
 * Nothing the customer reads changes, so the number, the PDF and the
 * snapshot all stay exactly as they were.
 */
export async function linkQuotationToProject(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const parsed = quotationLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not a project this can be attached to." };

  const [existing] = await db
    .select({
      projectId: quotations.projectId,
      documentId: quotations.documentId,
      number: quotations.number,
    })
    .from(quotations)
    .where(live(parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "That quotation no longer exists." };

  const next = parsed.data.projectId || null;
  if (next === existing.projectId) return { ok: true };

  let nextCode: string | null = null;
  if (next) {
    const [project] = await db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(eq(projects.id, next))
      .limit(1);
    if (!project) return { ok: false, error: "That project no longer exists." };
    nextCode = project.code;
  }

  await db.transaction(async (tx) => {
    // The filed copy belongs to the old project, so it goes with it. The S3
    // object stays: the quotation's own `s3Key` still points at it, and a
    // re-attach rebuilds the document row from there.
    if (existing.documentId) {
      await tx.delete(documents).where(eq(documents.id, existing.documentId));
    }

    // Detaching or moving always stands the quotation down: it cannot be the
    // offer for a project it has left. Attaching makes it the offer only
    // when that project has none yet.
    const chosen = next
      ? !(await hasChosen(tx as unknown as typeof db, next, parsed.data.id))
      : false;

    await tx
      .update(quotations)
      .set({ projectId: next, isChosen: chosen, documentId: null, updatedAt: new Date() })
      .where(eq(quotations.id, parsed.data.id));

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: next ? "quotation.attach" : "quotation.detach",
      entityType: "quotation",
      entityId: parsed.data.id,
      projectId: next ?? existing.projectId,
      before: { projectId: existing.projectId },
      after: { projectId: next, number: existing.number, projectCode: nextCode },
    });
  });

  // Re-file under the new project. Rendering again rather than copying the
  // document row keeps one path that produces a filed quotation.
  if (next) {
    const rendered = await renderAndStore(parsed.data.id);
    if (!rendered.ok) {
      return {
        ok: false,
        error: `Attached to ${nextCode}, but the PDF could not be filed: ${rendered.error}`,
      };
    }
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${parsed.data.id}`);
  if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
  if (next) revalidatePath(`/projects/${next}`);
  return { ok: true };
}

/**
 * The projects a quotation can be attached to.
 *
 * Every lifecycle stage, because the usual case is a walk-in who has just
 * become a LEAD. Newest first, which is where a just-created lead will be.
 */
export async function attachableProjects(): Promise<
  Array<{ id: string; code: string; name: string }>
> {
  const actor = await getActor();
  assertCan(actor, "quotation.write");

  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .orderBy(desc(projects.createdAt))
    .limit(300);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: [row.firstName, row.lastName].filter(Boolean).join(" "),
  }));
}

/**
 * Delete a quotation.
 *
 * This reverses an earlier decision that there would be no delete at all,
 * and it keeps the part of that decision that was right: a number is never
 * reused and never vanishes. What goes is the PDF, the row filed into the
 * project's documents, and the quotation's place in every list. What stays
 * is the row itself, carrying the number, the consumer, the amount and who
 * deleted it — so BHIM100003 can still be answered for when the customer
 * rings holding their copy.
 *
 * Who may do it turns on one thing: whether it is attached to a project. A
 * standalone quotation is a counter mistake and whoever raised it can take
 * it off the list. An attached one has been filed into that project's
 * documents and may have gone out in a bank loan pack, so it is admin only.
 * Both permissions live in the RBAC matrix; nothing here names a role.
 *
 * Deleting an attached one detaches it first, which frees the partial unique
 * index that allows a single chosen quotation per project — the project is
 * left with no offer rather than with a dangling one.
 */
export async function deleteQuotation(
  id: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();

  const [row] = await db
    .select({
      number: quotations.number,
      status: quotations.status,
      consumerName: quotations.consumerName,
      totalAmount: quotations.totalAmount,
      projectId: quotations.projectId,
      documentId: quotations.documentId,
      isChosen: quotations.isChosen,
      s3Key: quotations.s3Key,
    })
    .from(quotations)
    .where(live(id))
    .limit(1);
  if (!row) return { ok: false, error: "That quotation no longer exists." };

  const attached = Boolean(row.projectId);
  if (!can(actor, attached ? "quotation.delete.filed" : "quotation.delete")) {
    return {
      ok: false,
      error: attached
        ? "This quotation is attached to a project, so only an admin can delete it. Detach it first, or mark it Declined or Expired."
        : "You are not allowed to delete a quotation.",
    };
  }

  await db.transaction(async (tx) => {
    // The filed copy belongs to the project, exactly as on a detach.
    if (row.documentId) {
      await tx.delete(documents).where(eq(documents.id, row.documentId));
    }

    await tx
      .update(quotations)
      .set({
        deletedBy: actor!.id,
        deletedAt: new Date(),
        projectId: null,
        isChosen: false,
        documentId: null,
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, id));
  });

  // Last, and outside the transaction: an object cannot be rolled back, so
  // it goes only once the row is certainly marked. Neon keeps no versions.
  if (row.s3Key) await deleteDocumentObject(row.s3Key);

  await writeAudit({
    actorId: actor!.id,
    action: "quotation.delete",
    entityType: "quotation",
    entityId: id,
    projectId: row.projectId,
    before: {
      number: row.number,
      status: row.status,
      consumer: row.consumerName,
      amount: row.totalAmount,
      projectId: row.projectId,
      wasChosen: row.isChosen,
    },
    reason: reason?.trim() || null,
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  if (row.projectId) {
    revalidatePath(`/projects/${row.projectId}`);
    revalidatePath(`/projects/${row.projectId}/documents`);
  }
  return { ok: true };
}

/**
 * A short-lived link to the PDF.
 *
 * Asked for per click rather than rendered into the page, so the permission
 * check happens when the file is wanted. The URL points at this app's own
 * file route, which checks the permission again before a byte is served.
 * Reads are logged: a quotation carries a price.
 */
export async function getQuotationUrl(
  id: string,
  disposition: "inline" | "attachment" = "inline",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "quotation.read");

  const [row] = await db
    .select({ s3Key: quotations.s3Key, number: quotations.number, projectId: quotations.projectId })
    .from(quotations)
    .where(live(id))
    .limit(1);

  if (!row) return { ok: false, error: "That quotation no longer exists." };
  if (!row.s3Key) {
    return { ok: false, error: "No PDF has been built for this quotation yet." };
  }

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "quotation.download",
    entityType: "quotation",
    entityId: id,
    projectId: row.projectId,
    after: { number: row.number },
  });

  return {
    ok: true,
    url: fileHref("quotation", id, { download: disposition === "attachment" }),
  };
}
