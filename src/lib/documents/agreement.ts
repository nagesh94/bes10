import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  CONSUMER_UNDERTAKING,
  CONSUMER_UNDERTAKING_INTRO,
  FIRST_PARTY_DUTIES,
  HEADING,
  PAYMENT_FIXED_TERMS,
  PAYMENT_HEADING,
  RECITAL_CONSUMER,
  RECITAL_VENDOR,
  SECOND_PARTY_DUTIES,
  TITLE,
} from "./agreement-text";

/**
 * The vendor agreement, as an editable .docx.
 *
 * Deliberately not a PDF: this goes to a lawyer who prepares the hard copy,
 * so it has to be editable. The signed, notarised scan comes back as a
 * separate document and never replaces this one.
 */

export interface AgreementData {
  executionDate: Date;
  consumer: { title: string; name: string; address: string };
  vendor: { name: string; address: string };
  /** Clause 19.1 — the agreed number. Absent means the plan is not locked. */
  totalValue: number;
  /** Clause 19.1 (i)(ii)(iii) — from the locked milestones, in order. */
  schedule: Array<{ label: string; amount: number; percent: number | null }>;
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

function inr(n: number): string {
  return n.toLocaleString("en-IN");
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const body = (text: string, opts: { bold?: boolean; spacing?: number } = {}) =>
  new Paragraph({
    spacing: { after: opts.spacing ?? 140 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, bold: opts.bold ?? false, size: 22 })],
  });

const centred = (text: string, bold = false) =>
  new Paragraph({
    spacing: { after: 160 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size: 22 })],
  });

export async function buildAgreementDocx(data: AgreementData): Promise<Buffer> {
  const consumerFull = `${data.consumer.title} ${data.consumer.name}`.trim();

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [new TextRun({ text: TITLE, bold: true, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 200 },
      children: [new TextRun({ text: HEADING, bold: true, size: 24 })],
    }),

    body(
      `This agreement is executed on ${formatDate(data.executionDate)} for design, supply, installation, commissioning and 5-year comprehensive maintenance of RTS project/system along with warranty under PM Surya Ghar: Muft Bijli Yojana`,
    ),

    centred("Between"),
    body(
      `${consumerFull} having address at ${data.consumer.address} (hereinafter referred to as first Party i.e. consumer).`,
    ),
    centred("And"),
    body(
      `${data.vendor.name} having registered office at ${data.vendor.address} (hereinafter referred to as second Party i.e. Vendor).`,
    ),

    body("Whereas", { bold: true, spacing: 80 }),
    body(RECITAL_CONSUMER),
    body("And whereas", { bold: true, spacing: 80 }),
    body(RECITAL_VENDOR),

    body("The First Party hereby undertakes to perform the following activities:", {
      bold: true,
      spacing: 120,
    }),
    ...FIRST_PARTY_DUTIES.map(
      (t) =>
        new Paragraph({
          numbering: { reference: "first-party", level: 0 },
          spacing: { after: 100 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: t, size: 22 })],
        }),
    ),

    body("The Second Party hereby undertakes to perform the following activities:", {
      bold: true,
      spacing: 120,
    }),
    ...SECOND_PARTY_DUTIES.map(
      (d) =>
        new Paragraph({
          numbering: { reference: "second-party", level: 0 },
          spacing: { after: 100 },
          alignment: AlignmentType.JUSTIFIED,
          children: [
            ...(d.heading ? [new TextRun({ text: d.heading, bold: true, size: 22 })] : []),
            new TextRun({ text: d.text, size: 22 }),
          ],
        }),
    ),

    body(CONSUMER_UNDERTAKING_INTRO, { bold: true, spacing: 120 }),
    ...CONSUMER_UNDERTAKING.map(
      (t) =>
        new Paragraph({
          numbering: { reference: "undertaking", level: 0 },
          spacing: { after: 100 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: t.replace("{vendor}", data.vendor.name), size: 22 })],
        }),
    ),

    body(PAYMENT_HEADING, { bold: true, spacing: 120 }),
    body(
      `19.1. The cost of RTS System will be Rs. ${inr(data.totalValue)} (to be decided mutually). The Applicant shall pay the total cost to the Vendor as under:`,
    ),
    ...data.schedule.map(
      (s, i) =>
        new Paragraph({
          indent: { left: 720 },
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: `(${ROMAN[i] ?? i + 1})\t${
                s.percent !== null ? `${s.percent}% ` : ""
              }${s.label} — Rs. ${inr(s.amount)};`,
              size: 22,
            }),
          ],
        }),
    ),
    body(PAYMENT_FIXED_TERMS, { spacing: 400 }),

    // Signature blocks. Left blank — this is signed on paper.
    body("First Party:", { bold: true, spacing: 60 }),
    body(`Name: ${consumerFull}`, { spacing: 60 }),
    body(`Address: ${data.consumer.address}`, { spacing: 60 }),
    body("Sign:", { spacing: 60 }),
    body("Date:", { spacing: 400 }),

    body("Second Party:", { bold: true, spacing: 60 }),
    body(`Name: ${data.vendor.name}`, { spacing: 60 }),
    body(`Address: ${data.vendor.address}`, { spacing: 60 }),
    body("Sign:", { spacing: 60 }),
    body("Date:", { spacing: 60 }),
  ];

  const doc = new Document({
    creator: data.vendor.name,
    title: `Model Agreement — ${consumerFull}`,
    description: "Annexure 2 — PM Surya Ghar model draft agreement",
    numbering: {
      config: [
        {
          reference: "first-party",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: "second-party",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: "undertaking",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}
