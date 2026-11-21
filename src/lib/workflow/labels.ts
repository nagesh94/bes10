import type { StageKey } from "./stages";

/**
 * Plain-English text for each stage and each gate line.
 *
 * Kept out of the gate definitions so `stages.ts` stays a pure rules file
 * with no copy in it. These move into the message catalogues when the rest
 * of the app is translated.
 */

export const STAGE_TITLES: Record<StageKey, string> = {
  onboarding: "Onboarding & documentation",
  agreement: "Agreement",
  installation: "Installation",
  evidence: "Site evidence",
  dcr: "DCR certificate",
  meter: "Meter payment",
  documents: "Documents & portal upload",
  commissioning: "Commissioning",
  settlement: "Subsidy & settlement",
};

export const STAGE_BLURBS: Record<StageKey, string> = {
  onboarding: "Sections, flags, then the payment plan.",
  agreement: "Generated here, signed on paper, scanned back.",
  installation: "What went on the roof, serial by serial.",
  evidence: "Geotagged photos and material used.",
  dcr: "Raised on the DCR portal, then recorded here.",
  meter: "Paid on the DISCOM portal, receipt filed here.",
  documents: "Generate the set, then mark each uploaded.",
  commissioning: "DISCOM inspection and the commissioning certificate.",
  settlement: "Subsidy received, balance collected, project closed.",
};

export const GATE_LABELS: Record<string, string> = {
  // Stage 1
  prospectForm: "Prospect form complete",
  flagsResolved: "Flags resolved or waived",
  paymentPlanSaved: "Payment plan saved",
  // Stage 2
  quotation: "Quotation uploaded",
  customerSignature: "Customer signature on file",
  agreementGenerated: "Agreement generated",
  agreementSigned: "Signed scan uploaded",
  digitalApprovalLetter: "Digital approval letter uploaded",
  // Stage 3
  installationRecord: "Installation record complete",
  panelSerials: "Every panel serial captured",
  structureMembers: "Structure members recorded",
  batteryBank: "Battery bank recorded",
  // Stage 4
  photos: "Required photos taken",
  material: "Material consumption recorded",
  earthResistance: "Earth resistance under 2 Ω",
  // Stage 5
  certificate: "Certificate uploaded",
  number: "Number recorded",
  notApplicable: "Not a DCR project — nothing needed",
  // Stage 6
  paymentRecorded: "Meter payment recorded",
  receipt: "Receipt uploaded",
  // Stage 7
  generated: "Documents generated",
  portalUploaded: "Marked uploaded to the portal",
  // Stage 8
  performanceCheck: "Date of performance check entered",
  certificateGenerated: "Commissioning certificate generated",
  // Stage 9
  subsidyReceived: "Subsidy received",
  balanceCleared: "Outstanding balance cleared",
};

export function gateLabel(id: string): string {
  return GATE_LABELS[id] ?? id;
}

/**
 * There are only ever two kinds of flag, and both are a sentence the office
 * already says out loud. Shared because the header chip, the project list and
 * the stage-1 banner all name them and had drifted into three wordings.
 */
export const FLAG_LABELS: Record<string, string> = {
  NAME_MISMATCH: "Name change",
  LOAD_ENHANCEMENT: "Load enhancement",
};

export function flagLabel(type: string): string {
  return FLAG_LABELS[type] ?? type;
}
