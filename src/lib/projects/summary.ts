import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import {
  applicationDetails,
  bankAccounts,
  batteryBanks,
  channelPartners,
  coApplicants,
  contacts,
  customerAdvances,
  discomCompanies,
  documents,
  electricityConnections,
  externalRefs,
  financeApplications,
  flags,
  identityAadhaar,
  identityPan,
  installations,
  otherDetails,
  panelSerials,
  paymentPlans,
  paymentsReceived,
  projects,
  rooftopDetails,
  siteSurveys,
  structureMembers,
  subsidies,
  user,
} from "@/lib/db/schema";

/**
 * Everything on file about one customer, in one read.
 *
 * The nine stages each hold a sixth of what is known about a job, and the
 * only way to answer "what have we got on this one" was to walk all of them
 * with the forms in edit mode. This assembles the same fields as plain
 * reading matter, in the order the office thinks about them: who they are,
 * what was applied for, their papers, their roof, what went on it, and what
 * the DISCOM has given back.
 *
 * It is a read of rows that already exist — it computes nothing the stages
 * do not already say, and it writes nothing. A field nobody has filled in
 * shows as a dash rather than being dropped, because the gaps are half of
 * what someone opens this to see.
 */

const DASH = "—";

export interface SummaryRow {
  label: string;
  value: string;
  /** Numbers, IDs and references that get read aloud or copied. */
  mono?: boolean;
  /** Addresses and the like: takes the whole width of the grid. */
  wide?: boolean;
}

export interface SummarySection {
  key: string;
  title: string;
  blurb?: string;
  rows: SummaryRow[];
  /** True when not one field in the section has been filled in yet. */
  blank: boolean;
}

export interface ProjectSummary {
  sections: SummarySection[];
  /** Scanned on the roof, so there can be thirty of them. */
  panelSerials: string[];
  documentCount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Enum tokens as the office says them. Each list already exists on the page
 * that owns that part of the app — the leads list, the projects list, the
 * finance desk — and this page shows all of them at once, so it carries its
 * own copy rather than importing three pages.
 */
type T = Awaited<ReturnType<typeof getTranslations<"summary">>>;

const txt = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s === "" ? DASH : s;
};


const withUnit = (v: unknown, unit: string): string => {
  const s = txt(v);
  return s === DASH ? s : `${s} ${unit}`;
};

const fmt = (d: Date): string =>
  `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/**
 * A `date` column arrives as "2026-10-27" and a timestamp as a Date. The
 * plain date is split by hand rather than handed to `new Date`, which reads
 * it as UTC midnight and so prints the day before in any western timezone.
 */
const day = (v: Date | string | null | undefined): string => {
  if (!v) return DASH;
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? v : fmt(parsed);
  }
  return fmt(v);
};

const inr = (v: unknown): string => {
  if (v === null || v === undefined || String(v).trim() === "") return DASH;
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : DASH;
};

/** An enum token said the way the office says it, never the raw token. */

const join = (parts: Array<string | null | undefined>, sep: string): string =>
  parts.filter((p) => p !== null && p !== undefined && String(p).trim() !== "").join(sep) || DASH;

const section = (
  t: T,
  key: string,
  rows: SummaryRow[],
): SummarySection => ({
  key,
  title: t(`sections.${key}.title`),
  blurb: t(`sections.${key}.blurb`),
  rows,
  blank: rows.every((r) => r.value === DASH),
});

export async function loadProjectSummary(
  projectId: string,
  {
    includeMoney = false,
    includePersonal = false,
  }: {
    /** The caller has checked the actor against `money.read`. */
    includeMoney?: boolean;
    /**
     * The caller has checked the actor against `prospect.write` — the same
     * permission that opens stage 1, where the identity and bank fields are
     * collected. An installer reaches a project they are assigned to, and
     * this page must not be the one place that hands them the customer's
     * PAN and account number.
     */
    includePersonal?: boolean;
  } = {},
): Promise<ProjectSummary | null> {
  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;

  const [t, te] = await Promise.all([getTranslations("summary"), getTranslations("enums")]);
  const yesNo = (v: boolean | null | undefined): string =>
    v === null || v === undefined ? DASH : v ? t("yes") : t("no");
  const label = (group: string, v: string | null | undefined): string =>
    v ? (te.has(`${group}.${v}`) ? te(`${group}.${v}`) : v) : DASH;

  const { project, contact } = row;

  const [
    applicationRows,
    rooftopRows,
    aadhaarRows,
    panRows,
    bankRows,
    coAppRows,
    billRows,
    otherRows,
    surveyRows,
    installRows,
    batteryRows,
    refRows,
  ] = await Promise.all([
    db.select().from(applicationDetails).where(eq(applicationDetails.projectId, projectId)).limit(1),
    db.select().from(rooftopDetails).where(eq(rooftopDetails.projectId, projectId)).limit(1),
    includePersonal
      ? db.select().from(identityAadhaar).where(eq(identityAadhaar.projectId, projectId)).limit(1)
      : Promise.resolve([]),
    includePersonal
      ? db.select().from(identityPan).where(eq(identityPan.projectId, projectId)).limit(1)
      : Promise.resolve([]),
    includePersonal
      ? db.select().from(bankAccounts).where(eq(bankAccounts.projectId, projectId)).limit(1)
      : Promise.resolve([]),
    includePersonal
      ? db.select().from(coApplicants).where(eq(coApplicants.projectId, projectId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(electricityConnections)
      .where(eq(electricityConnections.projectId, projectId))
      .limit(1),
    db.select().from(otherDetails).where(eq(otherDetails.projectId, projectId)).limit(1),
    db.select().from(siteSurveys).where(eq(siteSurveys.projectId, projectId)).limit(1),
    db.select().from(installations).where(eq(installations.projectId, projectId)).limit(1),
    db.select().from(batteryBanks).where(eq(batteryBanks.projectId, projectId)).limit(1),
    db.select().from(externalRefs).where(eq(externalRefs.projectId, projectId)).limit(1),
  ]);

  const application = applicationRows[0];
  const rooftop = rooftopRows[0];
  const aadhaar = aadhaarRows[0];
  const pan = panRows[0];
  const bank = bankRows[0];
  const coApplicant = coAppRows[0];
  const bill = billRows[0];
  const other = otherRows[0];
  const survey = surveyRows[0];
  const install = installRows[0];
  const battery = batteryRows[0];
  const refs = refRows[0];

  // The second round trip: everything that needs an id out of the first.
  const [serialRows, memberRows, docCount, flagRows, discomRows, employeeRows, partnerRows, surveyorRows] =
    await Promise.all([
      db
        .select({ serialNo: panelSerials.serialNo })
        .from(panelSerials)
        .where(eq(panelSerials.projectId, projectId))
        .orderBy(asc(panelSerials.sortOrder)),
      db
        .select()
        .from(structureMembers)
        .where(eq(structureMembers.projectId, projectId))
        .orderBy(asc(structureMembers.sortOrder)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(documents)
        .where(and(eq(documents.projectId, projectId), isNull(documents.deletedAt))),
      db.select({ status: flags.status }).from(flags).where(eq(flags.projectId, projectId)),
      application?.discomCompanyId
        ? db
            .select({ name: discomCompanies.name })
            .from(discomCompanies)
            .where(eq(discomCompanies.id, application.discomCompanyId))
            .limit(1)
        : Promise.resolve([]),
      project.assignedEmployeeId
        ? db
            .select({ name: user.name })
            .from(user)
            .where(eq(user.id, project.assignedEmployeeId))
            .limit(1)
        : Promise.resolve([]),
      project.referredByPartnerId
        ? db
            .select({ name: channelPartners.name, phone: channelPartners.phone })
            .from(channelPartners)
            .where(eq(channelPartners.id, project.referredByPartnerId))
            .limit(1)
        : Promise.resolve([]),
      survey?.surveyedBy
        ? db.select({ name: user.name }).from(user).where(eq(user.id, survey.surveyedBy)).limit(1)
        : Promise.resolve([]),
    ]);

  const openFlagCount = flagRows.filter(
    (f) => f.status === "OPEN" || f.status === "IN_PROGRESS",
  ).length;

  const sections: SummarySection[] = [];

  sections.push(
    section(t, "customer", [
      { label: t("rows.fullName"), value: txt(`${contact.firstName} ${contact.lastName ?? ""}`.trim()) },
      { label: t("rows.gender"), value: txt(contact.gender) },
      { label: t("rows.phone"), value: txt(contact.phone), mono: true },
      { label: t("rows.email"), value: txt(contact.email) },
      { label: t("rows.address"), value: txt(contact.address), wide: true },
      { label: t("rows.pinCode"), value: txt(contact.pinCode), mono: true },
    ]),
  );

  sections.push(
    section(t, "project", [
      { label: t("rows.projectCode"), value: txt(project.code), mono: true },
      { label: t("rows.lifecycle"), value: label("lifecycle", project.lifecycleStage) },
      { label: t("rows.pipelineStage"), value: t("stageOf9", { no: project.pipelineStage }) },
      { label: t("rows.segment"), value: label("segment", project.segment) },
      { label: t("rows.leadStatus"), value: label("leadStatus", project.leadStatus) },
      { label: t("rows.leadSource"), value: label("leadSource", project.leadSource) },
      { label: t("rows.executive"), value: txt(employeeRows[0]?.name) },
      {
        label: t("rows.referredBy"),
        value: partnerRows[0] ? `${partnerRows[0].name} · ${partnerRows[0].phone}` : DASH,
      },
      { label: t("rows.openedOn"), value: day(project.createdAt) },
      { label: t("rows.openFlags"), value: openFlagCount > 0 ? String(openFlagCount) : t("none") },
      { label: t("rows.documentsOnFile"), value: String(docCount[0]?.n ?? 0) },
    ]),
  );

  sections.push(
    section(t, "application", [
      { label: t("rows.nationalPortalId"), value: txt(application?.nationalPortalId), mono: true },
      { label: t("rows.applicationDate"), value: day(application?.applicationDate) },
      { label: t("rows.sanctionDate"), value: day(application?.sanctionDate) },
      { label: t("rows.dcr"), value: application ? yesNo(application.isDcr) : DASH },
      { label: t("rows.applyingForSubsidy"), value: application ? yesNo(application.wantsSubsidy) : DASH },
      { label: t("rows.discom"), value: txt(discomRows[0]?.name) },
      { label: t("rows.region"), value: txt(application?.regionName) },
      { label: t("rows.circle"), value: txt(application?.circleName) },
      { label: t("rows.division"), value: txt(application?.divisionName) },
      { label: t("rows.zoneDc"), value: txt(application?.zoneName) },
    ]),
  );

  sections.push(
    section(t, "rooftop", [
      { label: t("rows.plantSize"), value: withUnit(rooftop?.plantKw, "kW") },
      { label: t("rows.askedForAsALead"), value: txt(project.interestedPlantKw) },
      { label: t("rows.latitude"), value: txt(rooftop?.latitude), mono: true },
      { label: t("rows.longitude"), value: txt(rooftop?.longitude), mono: true },
    ]),
  );

  if (includePersonal) {
    sections.push(
      // The Aadhaar number itself is not collected — only the name and the
      // address as printed on the card — so there is no number to show.
      section(t, "identity",
        [
          { label: t("rows.nameOnAadhaar"), value: txt(aadhaar?.nameOnAadhaar) },
          { label: t("rows.addressOnAadhaar"), value: txt(aadhaar?.addressOnAadhaar), wide: true },
          { label: t("rows.nameOnPan"), value: txt(pan?.nameOnPan) },
          { label: t("rows.panNumber"), value: txt(pan?.panNumber), mono: true },
        ],
      ),
    );

    sections.push(
      section(t, "bank", [
        { label: t("rows.bankName"), value: txt(bank?.bankName) },
        { label: t("rows.accountHolder"), value: txt(bank?.accountHolderName) },
        { label: t("rows.accountNumber"), value: txt(bank?.accountNumber), mono: true },
        { label: t("rows.ifscCode"), value: txt(bank?.ifscCode), mono: true },
        { label: t("rows.occupation"), value: txt(bank?.occupation) },
        { label: t("rows.coApplicantOnTheLoan"), value: bank ? yesNo(bank.hasCoApplicant) : DASH },
      ]),
    );

    if (bank?.hasCoApplicant || coApplicant) {
      sections.push(
        section(t, "coApplicant", [
          { label: t("rows.fullName"), value: txt(coApplicant?.name) },
          { label: t("rows.relationship"), value: txt(coApplicant?.relationship) },
          { label: t("rows.phone"), value: txt(coApplicant?.phone), mono: true },
          { label: t("rows.email"), value: txt(coApplicant?.email) },
          { label: t("rows.occupation"), value: txt(coApplicant?.occupation) },
          { label: t("rows.panNumber"), value: txt(coApplicant?.panNumber), mono: true },
        ]),
      );
    }
  }

  sections.push(
    section(t, "electricity", [
      { label: t("rows.consumerNumber"), value: txt(bill?.consumerNumber), mono: true },
      { label: t("rows.nameOnTheBill"), value: txt(bill?.nameOnBill) },
      { label: t("rows.sanctionedLoad"), value: withUnit(bill?.sanctionedLoadKw, "kW") },
      { label: t("rows.currentBillAmount"), value: inr(bill?.currentBillAmount) },
    ]),
  );

  sections.push(
    section(t, "equipment", [
      { label: t("rows.panelType"), value: txt(other?.panelType) },
      { label: t("rows.panelCompany"), value: txt(other?.panelCompany) },
      { label: t("rows.panelModel"), value: txt(other?.panelModelNo) },
      { label: t("rows.meterType"), value: txt(other?.meterType) },
    ]),
  );

  sections.push(
    section(t, "survey", [
      { label: t("rows.acCable"), value: withUnit(survey?.acCableLengthM, "m") },
      { label: t("rows.dcCable"), value: withUnit(survey?.dcCableLengthM, "m") },
      { label: t("rows.earthing"), value: withUnit(survey?.earthingLengthM, "m") },
      { label: t("rows.la"), value: withUnit(survey?.laLengthM, "m") },
      { label: t("rows.expectedWireLength"), value: withUnit(survey?.expectedWireLengthM, "m") },
      { label: t("rows.pipesRequired"), value: txt(survey?.pipesRequired) },
      { label: t("rows.surveyedBy"), value: txt(surveyorRows[0]?.name) },
      { label: t("rows.surveyedOn"), value: day(survey?.surveyedOn) },
    ]),
  );

  sections.push(
    section(t, "installation", [
      { label: t("rows.installedOn"), value: day(install?.installationDate) },
      { label: t("rows.panelCompany"), value: txt(install?.panelCompany) },
      { label: t("rows.panelModel"), value: txt(install?.panelModelNo) },
      { label: t("rows.panelWattage"), value: withUnit(install?.panelWattPeak, "Wp") },
      { label: t("rows.numberOfPanels"), value: txt(install?.totalPanels) },
      { label: t("rows.totalCapacity"), value: withUnit(install?.totalCapacityKw, "kW") },
      { label: t("rows.inverterManufacturer"), value: txt(install?.inverterManufacturer) },
      { label: t("rows.inverterBrand"), value: txt(install?.inverterBrand) },
      { label: t("rows.inverterModel"), value: txt(install?.inverterModelNo) },
      { label: t("rows.inverterSerial"), value: txt(install?.inverterSerial), mono: true },
      { label: t("rows.inverterCapacity"), value: withUnit(install?.inverterCapacityKw, "kW") },
      { label: t("rows.inverters"), value: txt(install?.inverterCount) },
      {
        label: t("rows.phase"),
        value: install?.inverterPhase
          ? install.inverterPhase === "THREE"
            ? t("threePhase")
            : t("singlePhase")
          : DASH,
      },
      { label: t("rows.hybridSystem"), value: install ? yesNo(install.isHybrid) : DASH },
      { label: t("rows.structureCompany"), value: txt(install?.structureCompany) },
      { label: t("rows.legs"), value: txt(install?.legCount) },
      {
        label: t("rows.structureMembers"),
        value: memberRows.length
          ? memberRows
              .map(
                (m) =>
                  `${m.memberType.charAt(0) + m.memberType.slice(1).toLowerCase()} ${txt(m.size)} × ${m.quantity}`,
              )
              .join(", ")
          : DASH,
        wide: true,
      },
      { label: t("rows.acdb"), value: join([install?.acdbMake, install?.acdbSizeType], " · ") },
      { label: t("rows.acdbSpdMcb"), value: join([install?.acdbSpd, install?.acdbMcb], " / ") },
      { label: t("rows.dcdb"), value: join([install?.dcdbMake, install?.dcdbSizeType], " · ") },
      { label: t("rows.dcdbSpdMcb"), value: join([install?.dcdbSpd, install?.dcdbMcb], " / ") },
      { label: t("rows.pipesUsed"), value: txt(install?.pipesUsed) },
      { label: t("rows.moduleSerialsScanned"), value: serialRows.length ? String(serialRows.length) : DASH },
    ]),
  );

  if (install?.isHybrid || battery) {
    sections.push(
      section(t, "battery", [
        { label: t("rows.manufacturer"), value: txt(battery?.manufacturer) },
        { label: t("rows.batteryType"), value: txt(battery?.batteryType) },
        { label: t("rows.cellCapacity"), value: txt(battery?.cellCapacity) },
        { label: t("rows.inSeries"), value: txt(battery?.seriesCount) },
        { label: t("rows.inParallel"), value: txt(battery?.parallelCount) },
        { label: t("rows.totalCapacity"), value: txt(battery?.totalCapacity) },
        { label: t("rows.totalVoltage"), value: txt(battery?.totalVoltage) },
      ]),
    );
  }

  sections.push(
    section(t, "dcr",
      [
        { label: t("rows.goingWithDcr"), value: application ? yesNo(application.isDcr) : DASH },
        { label: t("rows.dcrNumber"), value: txt(refs?.dcrNumber), mono: true },
        { label: t("rows.dcrIssuedOn"), value: day(refs?.dcrIssuedOn) },
        { label: t("rows.purchaseOrderNo"), value: txt(install?.purchaseOrderNo), mono: true },
        { label: t("rows.purchaseOrderDate"), value: day(install?.purchaseOrderDate) },
        { label: t("rows.cellManufacturer"), value: txt(install?.cellManufacturer) },
        { label: t("rows.cellGstInvoiceNo"), value: txt(install?.cellGstInvoiceNo), mono: true },
      ],
    ),
  );

  sections.push(
    section(t, "portal", [
      { label: t("rows.meterPaymentReference"), value: txt(refs?.meterPaymentRef), mono: true },
      { label: t("rows.meterPaidOn"), value: day(refs?.meterPaidOn) },
      ...(includeMoney ? [{ label: t("rows.meterAmount"), value: inr(refs?.meterAmount) }] : []),
      { label: t("rows.netMeterSerial"), value: txt(refs?.netMeterSerial), mono: true },
      { label: t("rows.janSamarthApplication"), value: txt(refs?.janSamarthApplicationId), mono: true },
      { label: t("rows.sanctionNumber"), value: txt(refs?.sanctionNumber), mono: true },
      { label: t("rows.performanceCheck"), value: day(refs?.performanceCheckDate) },
      { label: t("rows.jointInspection"), value: day(refs?.jointInspectionDate) },
      { label: t("rows.commissionedOn"), value: day(refs?.commissioningDate) },
      { label: t("rows.commissioningCertificateNo"), value: txt(refs?.commissioningCertNo), mono: true },
    ]),
  );

  // Amounts are read only for an actor the caller has already checked
  // against `money.read` — no monetary column is selected otherwise, which
  // is what makes this page safe to open as an employee.
  if (includeMoney) {
    const [planRows, receivedRows, advanceRows, financeRows, subsidyRows] = await Promise.all([
      db.select().from(paymentPlans).where(eq(paymentPlans.projectId, projectId)).limit(1),
      db
        .select({ amount: paymentsReceived.amount })
        .from(paymentsReceived)
        .where(eq(paymentsReceived.projectId, projectId)),
      db
        .select({ amount: customerAdvances.amount })
        .from(customerAdvances)
        .where(eq(customerAdvances.projectId, projectId)),
      db
        .select()
        .from(financeApplications)
        .where(eq(financeApplications.projectId, projectId))
        .limit(1),
      db.select().from(subsidies).where(eq(subsidies.projectId, projectId)).limit(1),
    ]);

    const plan = planRows[0];
    const finance = financeRows[0];
    const subsidy = subsidyRows[0];
    const totalValue = plan?.totalValue ? Number(plan.totalValue) : 0;
    const totalReceived = receivedRows.reduce((s, r) => s + Number(r.amount), 0);
    const totalGiven = advanceRows.reduce((s, a) => s + Number(a.amount), 0);

    sections.push(
      section(t, "money", [
        { label: t("rows.paymentMode"), value: label("payMode", plan?.mode) },
        { label: t("rows.projectValue"), value: inr(plan?.totalValue) },
        { label: t("rows.cashComponent"), value: inr(plan?.cashComponent) },
        { label: t("rows.financeComponent"), value: inr(plan?.financeComponent) },
        { label: t("rows.received"), value: receivedRows.length ? inr(totalReceived) : DASH },
        { label: t("rows.givenToTheCustomer"), value: advanceRows.length ? inr(totalGiven) : DASH },
        {
          label: t("rows.outstanding"),
          value: plan ? inr(Math.max(totalValue + totalGiven - totalReceived, 0)) : DASH,
        },
        { label: t("rows.loanBank"), value: txt(finance?.bankName) },
        { label: t("rows.loanAmount"), value: inr(finance?.loanAmount) },
        { label: t("rows.loanStatus"), value: finance ? label("financeStatus", finance.status) : DASH },
        { label: t("rows.subsidyStatus"), value: subsidy ? label("subsidyStatus", subsidy.status) : DASH },
        { label: t("rows.subsidyExpected"), value: inr(subsidy?.expectedAmount) },
        { label: t("rows.subsidyReceived"), value: inr(subsidy?.receivedAmount) },
      ]),
    );
  }

  return {
    sections,
    panelSerials: serialRows.map((s) => s.serialNo),
    documentCount: docCount[0]?.n ?? 0,
  };
}
