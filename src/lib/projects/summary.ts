import { and, asc, eq, isNull, sql } from "drizzle-orm";
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
const LIFECYCLE: Record<string, string> = {
  LEAD: "Lead",
  PROSPECT: "Prospect",
  CUSTOMER: "Customer",
};

const LEAD_STATUS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SURVEY_DONE: "Survey done",
  READY_TO_CONVERT: "Ready to convert",
  LOST: "Lost",
};

const LEAD_SOURCE: Record<string, string> = {
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  WEBSITE: "Website",
  CAMPAIGN: "Campaign",
  OTHER: "Other",
};

const SEGMENT: Record<string, string> = { RESIDENTIAL: "Residential" };

const PAYMENT_MODE: Record<string, string> = {
  CASH: "Cash",
  FINANCE: "Finance",
  SPLIT: "Cash + finance",
};

const FINANCE_STATUS: Record<string, string> = {
  NOT_APPLIED: "Not applied",
  APPLIED: "Applied on Jan Samarth",
  SANCTIONED: "Sanctioned, awaiting disbursal",
  DISBURSED: "Disbursed",
  REJECTED: "Rejected",
};

const SUBSIDY_STATUS: Record<string, string> = {
  NOT_APPLIED: "Not applied",
  APPLIED: "Applied",
  APPROVED: "Approved",
  RECEIVED: "Received",
};

const txt = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s === "" ? DASH : s;
};

const yesNo = (v: boolean | null | undefined): string =>
  v === null || v === undefined ? DASH : v ? "Yes" : "No";

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
const label = (map: Record<string, string>, v: string | null | undefined): string =>
  v ? (map[v] ?? v) : DASH;

const join = (parts: Array<string | null | undefined>, sep: string): string =>
  parts.filter((p) => p !== null && p !== undefined && String(p).trim() !== "").join(sep) || DASH;

const section = (
  key: string,
  title: string,
  blurb: string | undefined,
  rows: SummaryRow[],
): SummarySection => ({
  key,
  title,
  blurb,
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
    section("customer", "Customer", "Who the job belongs to.", [
      { label: "Full name", value: txt(`${contact.firstName} ${contact.lastName ?? ""}`.trim()) },
      { label: "Gender", value: txt(contact.gender) },
      { label: "Phone", value: txt(contact.phone), mono: true },
      { label: "Email", value: txt(contact.email) },
      { label: "Address", value: txt(contact.address), wide: true },
      { label: "PIN code", value: txt(contact.pinCode), mono: true },
    ]),
  );

  sections.push(
    section("project", "Project", "How it came in and who is carrying it.", [
      { label: "Project code", value: txt(project.code), mono: true },
      { label: "Lifecycle", value: label(LIFECYCLE, project.lifecycleStage) },
      { label: "Pipeline stage", value: `${project.pipelineStage} of 9` },
      { label: "Segment", value: label(SEGMENT, project.segment) },
      { label: "Lead status", value: label(LEAD_STATUS, project.leadStatus) },
      { label: "Lead source", value: label(LEAD_SOURCE, project.leadSource) },
      { label: "Executive", value: txt(employeeRows[0]?.name) },
      {
        label: "Referred by",
        value: partnerRows[0] ? `${partnerRows[0].name} · ${partnerRows[0].phone}` : DASH,
      },
      { label: "Opened on", value: day(project.createdAt) },
      { label: "Open flags", value: openFlagCount > 0 ? String(openFlagCount) : "None" },
      { label: "Documents on file", value: String(docCount[0]?.n ?? 0) },
    ]),
  );

  sections.push(
    section("application", "PM Surya Ghar application", "What the national portal holds.", [
      { label: "National Portal ID", value: txt(application?.nationalPortalId), mono: true },
      { label: "Application date", value: day(application?.applicationDate) },
      { label: "Sanction date", value: day(application?.sanctionDate) },
      { label: "DCR", value: application ? yesNo(application.isDcr) : DASH },
      { label: "Applying for subsidy", value: application ? yesNo(application.wantsSubsidy) : DASH },
      { label: "DISCOM", value: txt(discomRows[0]?.name) },
      { label: "Region", value: txt(application?.regionName) },
      { label: "Circle", value: txt(application?.circleName) },
      { label: "Division", value: txt(application?.divisionName) },
      { label: "Zone / DC", value: txt(application?.zoneName) },
    ]),
  );

  sections.push(
    section("rooftop", "Rooftop", "Plant size as applied for, and where the roof is.", [
      { label: "Plant size", value: withUnit(rooftop?.plantKw, "kW") },
      { label: "Asked for as a lead", value: txt(project.interestedPlantKw) },
      { label: "Latitude", value: txt(rooftop?.latitude), mono: true },
      { label: "Longitude", value: txt(rooftop?.longitude), mono: true },
    ]),
  );

  if (includePersonal) {
    sections.push(
      // The Aadhaar number itself is not collected — only the name and the
      // address as printed on the card — so there is no number to show.
      section(
        "identity",
        "Identity",
        "The four names the flag engine compares against each other.",
        [
          { label: "Name on Aadhaar", value: txt(aadhaar?.nameOnAadhaar) },
          { label: "Address on Aadhaar", value: txt(aadhaar?.addressOnAadhaar), wide: true },
          { label: "Name on PAN", value: txt(pan?.nameOnPan) },
          { label: "PAN number", value: txt(pan?.panNumber), mono: true },
        ],
      ),
    );

    sections.push(
      section("bank", "Bank", "Where the subsidy lands — the customer's account, never ours.", [
        { label: "Bank name", value: txt(bank?.bankName) },
        { label: "Account holder", value: txt(bank?.accountHolderName) },
        { label: "Account number", value: txt(bank?.accountNumber), mono: true },
        { label: "IFSC code", value: txt(bank?.ifscCode), mono: true },
        { label: "Occupation", value: txt(bank?.occupation) },
        { label: "Co-applicant on the loan", value: bank ? yesNo(bank.hasCoApplicant) : DASH },
      ]),
    );

    if (bank?.hasCoApplicant || coApplicant) {
      sections.push(
        section("coApplicant", "Co-applicant", "The bank wants the same identity set from them.", [
          { label: "Full name", value: txt(coApplicant?.name) },
          { label: "Relationship", value: txt(coApplicant?.relationship) },
          { label: "Phone", value: txt(coApplicant?.phone), mono: true },
          { label: "Email", value: txt(coApplicant?.email) },
          { label: "Occupation", value: txt(coApplicant?.occupation) },
          { label: "PAN number", value: txt(coApplicant?.panNumber), mono: true },
        ]),
      );
    }
  }

  sections.push(
    section("electricity", "Electricity connection", "Taken from the latest bill.", [
      { label: "Consumer number", value: txt(bill?.consumerNumber), mono: true },
      { label: "Name on the bill", value: txt(bill?.nameOnBill) },
      { label: "Sanctioned load", value: withUnit(bill?.sanctionedLoadKw, "kW") },
      { label: "Current bill amount", value: inr(bill?.currentBillAmount) },
    ]),
  );

  sections.push(
    section("equipment", "Equipment chosen", "Agreed at stage 1 and printed into the papers.", [
      { label: "Panel type", value: txt(other?.panelType) },
      { label: "Panel company", value: txt(other?.panelCompany) },
      { label: "Panel model", value: txt(other?.panelModelNo) },
      { label: "Meter type", value: txt(other?.meterType) },
    ]),
  );

  sections.push(
    section("survey", "Site survey", "Estimated runs, measured before the work.", [
      { label: "AC cable", value: withUnit(survey?.acCableLengthM, "m") },
      { label: "DC cable", value: withUnit(survey?.dcCableLengthM, "m") },
      { label: "Earthing", value: withUnit(survey?.earthingLengthM, "m") },
      { label: "LA", value: withUnit(survey?.laLengthM, "m") },
      { label: "Expected wire length", value: withUnit(survey?.expectedWireLengthM, "m") },
      { label: "Pipes required", value: txt(survey?.pipesRequired) },
      { label: "Surveyed by", value: txt(surveyorRows[0]?.name) },
      { label: "Surveyed on", value: day(survey?.surveyedOn) },
    ]),
  );

  sections.push(
    section("installation", "Installation", "What actually went on the roof.", [
      { label: "Installed on", value: day(install?.installationDate) },
      { label: "Panel company", value: txt(install?.panelCompany) },
      { label: "Panel model", value: txt(install?.panelModelNo) },
      { label: "Panel wattage", value: withUnit(install?.panelWattPeak, "Wp") },
      { label: "Number of panels", value: txt(install?.totalPanels) },
      { label: "Total capacity", value: withUnit(install?.totalCapacityKw, "kW") },
      { label: "Inverter manufacturer", value: txt(install?.inverterManufacturer) },
      { label: "Inverter brand", value: txt(install?.inverterBrand) },
      { label: "Inverter model", value: txt(install?.inverterModelNo) },
      { label: "Inverter serial", value: txt(install?.inverterSerial), mono: true },
      { label: "Inverter capacity", value: withUnit(install?.inverterCapacityKw, "kW") },
      { label: "Inverters", value: txt(install?.inverterCount) },
      {
        label: "Phase",
        value: install?.inverterPhase
          ? install.inverterPhase === "THREE"
            ? "Three phase"
            : "Single phase"
          : DASH,
      },
      { label: "Hybrid system", value: install ? yesNo(install.isHybrid) : DASH },
      { label: "Structure company", value: txt(install?.structureCompany) },
      { label: "Legs", value: txt(install?.legCount) },
      {
        label: "Structure members",
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
      { label: "ACDB", value: join([install?.acdbMake, install?.acdbSizeType], " · ") },
      { label: "ACDB SPD / MCB", value: join([install?.acdbSpd, install?.acdbMcb], " / ") },
      { label: "DCDB", value: join([install?.dcdbMake, install?.dcdbSizeType], " · ") },
      { label: "DCDB SPD / MCB", value: join([install?.dcdbSpd, install?.dcdbMcb], " / ") },
      { label: "Module serials scanned", value: serialRows.length ? String(serialRows.length) : DASH },
    ]),
  );

  if (install?.isHybrid || battery) {
    sections.push(
      section("battery", "Battery bank", "Only on a hybrid system.", [
        { label: "Manufacturer", value: txt(battery?.manufacturer) },
        { label: "Battery type", value: txt(battery?.batteryType) },
        { label: "Cell capacity", value: txt(battery?.cellCapacity) },
        { label: "In series", value: txt(battery?.seriesCount) },
        { label: "In parallel", value: txt(battery?.parallelCount) },
        { label: "Total capacity", value: txt(battery?.totalCapacity) },
        { label: "Total voltage", value: txt(battery?.totalVoltage) },
      ]),
    );
  }

  sections.push(
    section(
      "dcr",
      "DCR",
      "The undertaking states that these specific cells were made in India, so it cannot be signed without the purchase order and the cell manufacturer behind it.",
      [
        { label: "Going with DCR", value: application ? yesNo(application.isDcr) : DASH },
        { label: "DCR number", value: txt(refs?.dcrNumber), mono: true },
        { label: "DCR issued on", value: day(refs?.dcrIssuedOn) },
        { label: "Purchase order no.", value: txt(install?.purchaseOrderNo), mono: true },
        { label: "Purchase order date", value: day(install?.purchaseOrderDate) },
        { label: "Cell manufacturer", value: txt(install?.cellManufacturer) },
        { label: "Cell GST invoice no.", value: txt(install?.cellGstInvoiceNo), mono: true },
      ],
    ),
  );

  sections.push(
    section("portal", "Meter, portal and commissioning", "The references that came back.", [
      { label: "Meter payment reference", value: txt(refs?.meterPaymentRef), mono: true },
      { label: "Meter paid on", value: day(refs?.meterPaidOn) },
      ...(includeMoney ? [{ label: "Meter amount", value: inr(refs?.meterAmount) }] : []),
      { label: "Net meter serial", value: txt(refs?.netMeterSerial), mono: true },
      { label: "Jan Samarth application", value: txt(refs?.janSamarthApplicationId), mono: true },
      { label: "Sanction number", value: txt(refs?.sanctionNumber), mono: true },
      { label: "Performance check", value: day(refs?.performanceCheckDate) },
      { label: "Joint inspection", value: day(refs?.jointInspectionDate) },
      { label: "Commissioned on", value: day(refs?.commissioningDate) },
      { label: "Commissioning certificate no.", value: txt(refs?.commissioningCertNo), mono: true },
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
      section("money", "Money", "Admin only — the same figures as the payment plan.", [
        { label: "Payment mode", value: label(PAYMENT_MODE, plan?.mode) },
        { label: "Project value", value: inr(plan?.totalValue) },
        { label: "Cash component", value: inr(plan?.cashComponent) },
        { label: "Finance component", value: inr(plan?.financeComponent) },
        { label: "Received", value: receivedRows.length ? inr(totalReceived) : DASH },
        { label: "Given to the customer", value: advanceRows.length ? inr(totalGiven) : DASH },
        {
          label: "Outstanding",
          value: plan ? inr(Math.max(totalValue + totalGiven - totalReceived, 0)) : DASH,
        },
        { label: "Loan bank", value: txt(finance?.bankName) },
        { label: "Loan amount", value: inr(finance?.loanAmount) },
        { label: "Loan status", value: finance ? label(FINANCE_STATUS, finance.status) : DASH },
        { label: "Subsidy status", value: subsidy ? label(SUBSIDY_STATUS, subsidy.status) : DASH },
        { label: "Subsidy expected", value: inr(subsidy?.expectedAmount) },
        { label: "Subsidy received", value: inr(subsidy?.receivedAmount) },
      ]),
    );
  }

  return {
    sections,
    panelSerials: serialRows.map((s) => s.serialNo),
    documentCount: docCount[0]?.n ?? 0,
  };
}
