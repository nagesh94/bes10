/**
 * The nine pipeline stages and the gate on each one.
 *
 * Gates are pure functions of a project snapshot. No database access, no
 * request context — which means every gate is covered by a table-driven test,
 * and a gate that opens early is caught before it ships. A stage opening too
 * soon is the worst bug this system can have: it lets a project reach a bank
 * or a government portal with a document missing.
 *
 * An admin can override a gate, but only with a written reason, and the
 * override is audit-logged against their name.
 */

export const STAGE_KEYS = [
  "onboarding",
  "agreement",
  "installation",
  "evidence",
  "dcr",
  "meter",
  "documents",
  "commissioning",
  "settlement",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export type StageStatus = "not_started" | "in_progress" | "blocked" | "complete";

export type PaymentMode = "CASH" | "FINANCE" | "SPLIT";

/**
 * Everything a gate is allowed to look at. Built by one query per project.
 */
export interface ProjectSnapshot {
  // Stage 1
  prospectSectionsComplete: number; // of 8
  openFlagCount: number;
  paymentPlanLocked: boolean;
  paymentMode: PaymentMode | null;

  // Stage 2
  quotationUploaded: boolean;
  customerSignatureUploaded: boolean;
  agreementGenerated: boolean;
  agreementSignedScanUploaded: boolean;
  /** Only meaningful when the plan involves finance. */
  sanctionLetterUploaded: boolean;
  /** The second Jan Samarth paper. Finance-only, like the sanction letter. */
  digitalApprovalLetterUploaded: boolean;

  // Stage 3
  installationRecorded: boolean;
  panelSerialsCaptured: number;
  panelCount: number;
  structureMemberCount: number;
  isHybrid: boolean;
  batteryBankRecorded: boolean;

  // Stage 4
  requiredPhotoCount: number;
  capturedPhotoCount: number;
  materialRecorded: boolean;
  earthResistanceOhms: number | null;

  // Stage 5 — only when the project is DCR
  isDcr: boolean;
  dcrCertificateUploaded: boolean;
  dcrNumberRecorded: boolean;

  // Stage 6
  meterPaymentRecorded: boolean;
  meterReceiptUploaded: boolean;

  // Stage 7
  generatedDocumentsReady: boolean;
  portalDocumentsUploaded: number;
  portalDocumentsTotal: number;

  // Stage 8
  performanceCheckDate: Date | null;
  commissioningCertificateGenerated: boolean;
  /** The wet-signed scan, not the copy we produced. */
  commissioningCertificateUploaded: boolean;

  // Stage 9
  wantsSubsidy: boolean;
  subsidyReceived: boolean;
  outstandingBalance: number;
}

export interface GateItem {
  id: string;
  /** i18n key under `stages.<stageKey>.gate.<id>` */
  labelKey: string;
  passed: boolean;
  /** Short factual detail, e.g. "4 of 7". Not translated — it is data. */
  detail?: string;
}

export interface StageDefinition {
  no: number;
  key: StageKey;
  /** Stage 9 is money, so it is admin-only. */
  adminOnly?: boolean;
  gate: (p: ProjectSnapshot) => GateItem[];
}

/**
 * Whether the project involves a bank loan at all.
 *
 * A CASH project has no Jan Samarth application, no sanction letter and no
 * bank loan pack. None of that is hidden — it simply does not exist for that
 * project, so it is never gated on.
 */
export function involvesFinance(mode: PaymentMode | null): boolean {
  return mode === "FINANCE" || mode === "SPLIT";
}

const ok = (id: string, passed: boolean, detail?: string): GateItem => ({
  id,
  labelKey: id,
  passed,
  ...(detail === undefined ? {} : { detail }),
});

export const STAGES: StageDefinition[] = [
  {
    no: 1,
    key: "onboarding",
    gate: (p) => [
      ok("prospectForm", p.prospectSectionsComplete >= 8, `${p.prospectSectionsComplete} of 8`),
      ok("flagsResolved", p.openFlagCount === 0, p.openFlagCount > 0 ? `${p.openFlagCount} open` : undefined),
      ok("paymentPlanLocked", p.paymentPlanLocked),
    ],
  },
  {
    no: 2,
    key: "agreement",
    gate: (p) => {
      const items = [
        ok("quotation", p.quotationUploaded),
        ok("customerSignature", p.customerSignatureUploaded),
        ok("agreementGenerated", p.agreementGenerated),
        ok("agreementSigned", p.agreementSignedScanUploaded),
      ];
      // Conditional: cash projects never see these.
      if (involvesFinance(p.paymentMode)) {
        items.push(ok("sanctionLetter", p.sanctionLetterUploaded));
        items.push(ok("digitalApprovalLetter", p.digitalApprovalLetterUploaded));
      }
      return items;
    },
  },
  {
    no: 3,
    key: "installation",
    gate: (p) => {
      const items = [
        ok("installationRecord", p.installationRecorded),
        ok(
          "panelSerials",
          p.panelCount > 0 && p.panelSerialsCaptured >= p.panelCount,
          `${p.panelSerialsCaptured} of ${p.panelCount}`,
        ),
        ok("structureMembers", p.structureMemberCount > 0, `${p.structureMemberCount} members`),
      ];
      if (p.isHybrid) {
        items.push(ok("batteryBank", p.batteryBankRecorded));
      }
      return items;
    },
  },
  {
    no: 4,
    key: "evidence",
    gate: (p) => [
      ok(
        "photos",
        p.requiredPhotoCount > 0 && p.capturedPhotoCount >= p.requiredPhotoCount,
        `${p.capturedPhotoCount} of ${p.requiredPhotoCount}`,
      ),
      ok("material", p.materialRecorded),
      // The DISCOM limit. Recorded on site and printed into the work
      // completion report, so it is gated rather than merely stored.
      ok(
        "earthResistance",
        p.earthResistanceOhms !== null && p.earthResistanceOhms < 2,
        p.earthResistanceOhms === null ? undefined : `${p.earthResistanceOhms} Ω`,
      ),
    ],
  },
  {
    no: 5,
    key: "dcr",
    gate: (p) =>
      p.isDcr
        ? [ok("certificate", p.dcrCertificateUploaded), ok("number", p.dcrNumberRecorded)]
        : [ok("notApplicable", true)],
  },
  {
    no: 6,
    key: "meter",
    gate: (p) => [
      ok("paymentRecorded", p.meterPaymentRecorded),
      ok("receipt", p.meterReceiptUploaded),
    ],
  },
  {
    no: 7,
    key: "documents",
    gate: (p) => [
      ok("generated", p.generatedDocumentsReady),
      ok(
        "portalUploaded",
        p.portalDocumentsTotal > 0 && p.portalDocumentsUploaded >= p.portalDocumentsTotal,
        `${p.portalDocumentsUploaded} of ${p.portalDocumentsTotal}`,
      ),
    ],
  },
  {
    no: 8,
    key: "commissioning",
    gate: (p) => [
      // The certificate certifies that a performance check happened, so the
      // date comes first: without it there is nothing to certify.
      ok("performanceCheck", p.performanceCheckDate !== null),
      ok("certificateGenerated", p.commissioningCertificateGenerated),
      ok("certificate", p.commissioningCertificateUploaded),
    ],
  },
  {
    no: 9,
    key: "settlement",
    adminOnly: true,
    gate: (p) => {
      const items: GateItem[] = [];
      if (p.wantsSubsidy) items.push(ok("subsidyReceived", p.subsidyReceived));
      items.push(ok("balanceCleared", p.outstandingBalance <= 0));
      return items;
    },
  },
];

export function stageByNo(no: number): StageDefinition | undefined {
  return STAGES.find((s) => s.no === no);
}

export interface GateResult {
  items: GateItem[];
  passed: boolean;
  outstanding: GateItem[];
}

export function evaluateGate(no: number, snapshot: ProjectSnapshot): GateResult {
  const stage = stageByNo(no);
  if (!stage) throw new Error(`Unknown stage: ${no}`);
  const items = stage.gate(snapshot);
  const outstanding = items.filter((i) => !i.passed);
  return { items, passed: outstanding.length === 0, outstanding };
}

/**
 * A stage can only be entered once every earlier stage is complete.
 * `completedStages` is the set of stage numbers already marked complete.
 */
export function canEnterStage(no: number, completedStages: ReadonlySet<number>): boolean {
  if (no <= 1) return true;
  for (let i = 1; i < no; i++) {
    if (!completedStages.has(i)) return false;
  }
  return true;
}
