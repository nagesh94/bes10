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
  onboarding: "Eight sections, the flag checks, then the payment plan.",
  agreement: "Generated here, signed on paper, scanned back.",
  installation: "What actually went on the roof, serial by serial.",
  evidence: "Geotagged photos and the material actually consumed.",
  dcr: "Raised on the DCR portal, then recorded here.",
  meter: "Paid on the DISCOM portal, receipt filed here.",
  documents: "Generate the set, then mark each one uploaded to PM Surya Ghar.",
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
