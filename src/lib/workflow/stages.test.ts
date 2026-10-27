import { describe, expect, it } from "vitest";
import {
  STAGES,
  canEnterStage,
  evaluateGate,
  involvesFinance,
  type ProjectSnapshot,
} from "./stages";

/** A project where everything is done. Each test spoils one thing. */
const complete: ProjectSnapshot = {
  prospectSectionsComplete: 8,
  openFlagCount: 0,
  paymentPlanSaved: true,
  paymentMode: "SPLIT",

  quotationUploaded: true,
  customerSignatureUploaded: true,
  agreementGenerated: true,
  agreementSignedScanUploaded: true,
  digitalApprovalLetterUploaded: true,

  installationRecorded: true,
  panelSerialsCaptured: 9,
  panelCount: 9,
  structureMemberCount: 7,
  isHybrid: false,
  batteryBankRecorded: false,

  requiredPhotoCount: 6,
  capturedPhotoCount: 6,
  materialRecorded: true,
  earthResistanceOhms: 1.2,

  isDcr: true,
  dcrCertificateUploaded: true,
  dcrNumberRecorded: true,

  meterPaymentRecorded: true,
  meterReceiptUploaded: true,

  generatedDocumentsReady: true,
  portalDocumentsUploaded: 7,
  portalDocumentsTotal: 7,

  performanceCheckDate: new Date("2026-09-20"),
  commissioningCertificateGenerated: true,
  commissioningCertificateUploaded: true,

  wantsSubsidy: true,
  subsidyReceived: true,
  outstandingBalance: 0,
};

const spoil = (patch: Partial<ProjectSnapshot>): ProjectSnapshot => ({ ...complete, ...patch });

describe("every stage passes on a complete project", () => {
  it.each(STAGES.map((s) => [s.no, s.key] as const))("stage %i (%s)", (no) => {
    expect(evaluateGate(no, complete).passed).toBe(true);
  });
});

describe("stage 1 — onboarding", () => {
  it("stays shut while the form is incomplete", () => {
    const r = evaluateGate(1, spoil({ prospectSectionsComplete: 6 }));
    expect(r.passed).toBe(false);
    expect(r.outstanding[0]?.detail).toBe("6 of 8");
  });

  it("stays shut while a flag is open", () => {
    expect(evaluateGate(1, spoil({ openFlagCount: 1 })).passed).toBe(false);
  });

  it("stays shut until the payment plan is saved", () => {
    expect(evaluateGate(1, spoil({ paymentPlanSaved: false })).passed).toBe(false);
  });
});

describe("stage 2 — finance is conditional", () => {
  it("requires the digital approval letter on a split project", () => {
    const r = evaluateGate(2, spoil({ paymentMode: "SPLIT", digitalApprovalLetterUploaded: false }));
    expect(r.passed).toBe(false);
    expect(r.outstanding.map((i) => i.id)).toContain("digitalApprovalLetter");
  });

  it("requires it on a fully financed project", () => {
    expect(
      evaluateGate(2, spoil({ paymentMode: "FINANCE", digitalApprovalLetterUploaded: false }))
        .passed,
    ).toBe(false);
  });

  it("never asks for it on a cash project", () => {
    const r = evaluateGate(
      2,
      spoil({ paymentMode: "CASH", digitalApprovalLetterUploaded: false }),
    );
    expect(r.passed).toBe(true);
    expect(r.items.map((i) => i.id)).not.toContain("digitalApprovalLetter");
  });

  it("knows which modes involve a bank", () => {
    expect(involvesFinance("CASH")).toBe(false);
    expect(involvesFinance("FINANCE")).toBe(true);
    expect(involvesFinance("SPLIT")).toBe(true);
    expect(involvesFinance(null)).toBe(false);
  });
});

describe("stage 3 — installation", () => {
  it("counts every panel serial", () => {
    const r = evaluateGate(3, spoil({ panelSerialsCaptured: 4, panelCount: 9 }));
    expect(r.passed).toBe(false);
    expect(r.outstanding.map((i) => i.detail)).toContain("4 of 9");
  });

  it("requires at least one structure member", () => {
    expect(evaluateGate(3, spoil({ structureMemberCount: 0 })).passed).toBe(false);
  });

  it("asks for the battery bank only on a hybrid system", () => {
    expect(evaluateGate(3, spoil({ isHybrid: false, batteryBankRecorded: false })).passed).toBe(true);
    expect(evaluateGate(3, spoil({ isHybrid: true, batteryBankRecorded: false })).passed).toBe(false);
  });
});

describe("stage 4 — evidence", () => {
  it("counts every required photo", () => {
    expect(evaluateGate(4, spoil({ capturedPhotoCount: 4 })).passed).toBe(false);
  });

  it("holds the DISCOM earth resistance limit of 2 ohms", () => {
    expect(evaluateGate(4, spoil({ earthResistanceOhms: 1.9 })).passed).toBe(true);
    expect(evaluateGate(4, spoil({ earthResistanceOhms: 2 })).passed).toBe(false);
    expect(evaluateGate(4, spoil({ earthResistanceOhms: 3.4 })).passed).toBe(false);
  });

  it("stays shut until the resistance has been measured at all", () => {
    expect(evaluateGate(4, spoil({ earthResistanceOhms: null })).passed).toBe(false);
  });
});

describe("stage 5 — DCR is conditional", () => {
  it("is skipped entirely on a non-DCR project", () => {
    expect(
      evaluateGate(5, spoil({ isDcr: false, dcrCertificateUploaded: false, dcrNumberRecorded: false }))
        .passed,
    ).toBe(true);
  });

  it("requires both the certificate and the number on a DCR project", () => {
    expect(evaluateGate(5, spoil({ dcrNumberRecorded: false })).passed).toBe(false);
  });
});

describe("stage 7 — portal upload", () => {
  it("stays shut until every document is marked uploaded", () => {
    const r = evaluateGate(7, spoil({ portalDocumentsUploaded: 4 }));
    expect(r.passed).toBe(false);
    expect(r.outstanding.map((i) => i.detail)).toContain("4 of 7");
  });
});

describe("stage 8 — commissioning", () => {
  it("opens when the date, the generated certificate and the signed scan are all in", () => {
    expect(evaluateGate(8, complete).passed).toBe(true);
  });

  it("will not certify a performance check that has no date", () => {
    expect(evaluateGate(8, spoil({ performanceCheckDate: null })).passed).toBe(false);
  });

  it("distinguishes the certificate we generate from the one that comes back signed", () => {
    // Generated but not yet signed and scanned: the gate stays shut, and it
    // is the signed scan that is missing, not the generation.
    const unsigned = evaluateGate(8, spoil({ commissioningCertificateUploaded: false }));
    expect(unsigned.passed).toBe(false);
    expect(unsigned.outstanding.map((i) => i.id)).toEqual(["certificate"]);

    const ungenerated = evaluateGate(8, spoil({ commissioningCertificateGenerated: false }));
    expect(ungenerated.outstanding.map((i) => i.id)).toEqual(["certificateGenerated"]);
  });
});

describe("stage 9 — settlement", () => {
  it("waits for the subsidy when one was applied for", () => {
    expect(evaluateGate(9, spoil({ subsidyReceived: false })).passed).toBe(false);
  });

  it("skips the subsidy check when none was applied for", () => {
    expect(
      evaluateGate(9, spoil({ wantsSubsidy: false, subsidyReceived: false })).passed,
    ).toBe(true);
  });

  it("stays shut while money is outstanding", () => {
    expect(evaluateGate(9, spoil({ outstandingBalance: 93_000 })).passed).toBe(false);
  });

  it("is admin-only", () => {
    expect(STAGES.find((s) => s.no === 9)?.adminOnly).toBe(true);
  });
});

describe("canEnterStage", () => {
  it("always allows stage 1", () => {
    expect(canEnterStage(1, new Set())).toBe(true);
  });

  it("refuses a stage while an earlier one is incomplete", () => {
    expect(canEnterStage(3, new Set([1]))).toBe(false);
    expect(canEnterStage(5, new Set([1, 2, 3]))).toBe(false);
  });

  it("allows a stage once every earlier one is complete", () => {
    expect(canEnterStage(3, new Set([1, 2]))).toBe(true);
    expect(canEnterStage(9, new Set([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(true);
  });

  it("will not let a later stage stand in for a skipped one", () => {
    expect(canEnterStage(4, new Set([1, 2, 5, 6]))).toBe(false);
  });
});
