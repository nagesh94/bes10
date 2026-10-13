import { Document, Packer, Paragraph, Table } from "docx";
import {
  AlignmentType,
  BLANK,
  NUMBERING_CONFIG,
  PAGE,
  SIZE,
  blankLine,
  centred,
  formatDate,
  justified,
  rich,
  rupees,
  table,
  title,
  value,
  type CellSpec,
  type SignatureImage,
} from "./docx-kit";
import { capacityKwp, consumerWithTitle, fullAddress, type DocContext } from "./context";

/**
 * The joint inspection report.
 *
 * The only generated document that states money, and it states all three
 * figures because the DISCOM's form has a line for each. The figures are
 * merged in here, server-side, and never travel to a browser — an employee
 * can produce this file without the amounts appearing on screen.
 *
 * Its signature blocks are a grid read down the side, not across: the row
 * labels (Name, Designation, Date, Sign, Seal) sit in a left column and each
 * party is a column beside them. Building it as independent columns, as an
 * earlier version did, put the labels in the wrong place entirely.
 *
 * Item 9 keeps "(Net meter/Gross meter/Net billing)" in full and item 7, 8
 * and the performance date stay blank: all four are settled at the inspection
 * itself, with a pen.
 */
export async function buildJointInspectionDocx(ctx: DocContext): Promise<Buffer> {
  const { money, dates } = ctx;
  const consumer = consumerWithTitle(ctx);
  // The grids print the bare name; only the numbered items carry the title.
  const bareName = consumerWithTitle(ctx, false);

  const items: Array<[string, string | null, boolean]> = [
    ["Name of the beneficiary", consumer, true],
    ["Address of installation with pin code", fullAddress(ctx), true],
    ["Electricity consumer number", ctx.consumer.consumerNumber, false],
    ["Solar PV module capacity (DC)", capacityKwp(ctx), true],
    [
      "Inverter capacity (AC) (Nominal output power)",
      ctx.install.inverterCapacityKw ? `${ctx.install.inverterCapacityKw} kW` : null,
      true,
    ],
    ["Date of installation", formatDate(ctx.install.installationDate), true],
  ];

  const children: Array<Paragraph | Table> = [
    title("Joint Inspection report"),

    justified([
      {
        text: "It is to certify that a Grid Connected Solar PV Power Plant has been installed with following details:",
      },
    ]),

    ...items.map(([label, val, underline], i) =>
      rich([{ text: `${i + 1}. ${label}: ` }, value(val, { underline })], {
        spacing: { after: 80, line: 276 },
      }),
    ),

    // Settled at the inspection, so they print as rules to write on.
    rich([
      { text: "7. Date of Commissioning (after installation of Net meter) :" },
      value(formatDate(dates.commissioning), { underline: true, fallback: BLANK }),
    ]),
    rich([
      { text: "8. Date of Joint inspection: " },
      value(formatDate(dates.jointInspection), { underline: true, fallback: BLANK }),
    ]),
    rich([{ text: "9. Metering arrangement: (Net meter/Gross meter/Net billing)" }]),

    justified([
      { text: "The above system is as per BIS/MNRE specifications and has been checked for its performance on" },
      value(formatDate(dates.performanceCheck), { underline: true, fallback: BLANK }),
      { text: " and it is working satisfactorily." },
    ]),
    blankLine(80),

    signatureGrid(
      [
        { caption: "DISCOM", name: null, image: null },
        { caption: "EMPANELLED AGENCY", name: ctx.vendor.name, image: ctx.signatures.vendor },
        { caption: "CONSUMER", name: bareName, image: ctx.signatures.consumer },
      ],
      true,
    ),
    blankLine(160),

    justified([
      { text: "It is to certify that the above system has been purchased with following details:" },
    ]),

    // The original lines its colons up in a column, so the label and the
    // separator are separate cells rather than one run of text.
    table(
      [
        [
          { width: 42, text: "1. Total project cost" },
          { width: 4, text: ":" },
          { width: 54, segments: [value(money ? rupees(money.totalProjectCost) : null, { underline: true })] },
        ],
        [
          { width: 42, text: "2. Subsidy amount" },
          { width: 4, text: ":" },
          { width: 54, segments: [value(money ? rupees(money.subsidyAmount) : null, { underline: true })] },
        ],
        [
          { width: 42, text: "3. Amount paid by beneficiary" },
          { width: 4, text: ":" },
          {
            width: 54,
            segments: [value(money ? rupees(money.paidByBeneficiary) : null, { underline: true })],
          },
        ],
      ],
      { bordered: false },
    ),
    blankLine(80),

    signatureGrid(
      [
        { caption: "EMPANELLED AGENCY", name: ctx.vendor.name, image: ctx.signatures.vendor },
        { caption: "CONSUMER", name: bareName, image: ctx.signatures.consumer },
      ],
      false,
    ),
  ];

  const doc = new Document({
    creator: ctx.vendor.name,
    title: `Joint Inspection Report — ${ctx.projectCode}`,
    numbering: NUMBERING_CONFIG,
    styles: { default: { document: { run: { font: "Times New Roman", size: SIZE.body } } } },
    sections: [{ properties: PAGE, children }],
  });

  return Packer.toBuffer(doc).then((b) => Buffer.from(b));
}

interface Party {
  caption: string;
  /** Printed on the Name row, underlined. Null leaves a rule to write on. */
  name: string | null;
  image: SignatureImage;
}

/**
 * The five-row signature grid.
 *
 * Rows are Name, Designation, Date, Sign, Seal down the left. A party we hold
 * a signature for gets the image spanning the four rows under its name, which
 * is how the original places it; a party we do not — the DISCOM, who sign in
 * the room — gets a rule on each row instead.
 */
function signatureGrid(parties: Party[], withLabels: boolean): Table {
  // Column widths are set explicitly rather than split evenly: "EMPANELLED
  // AGENCY" is much the longest caption and "Designation" much the longest
  // row label, and letting either wrap pushed the second grid onto a second
  // page when the original is a single sheet.
  const labelWidth = withLabels ? 16 : 16;
  const partyWidths =
    parties.length === 3 ? [23, 32, 29] : [42, 42];
  const widthOf = (i: number) => partyWidths[i] ?? Math.floor((100 - labelWidth) / parties.length);
  const rows: CellSpec[][] = [];

  rows.push([
    { width: labelWidth, text: "" },
    ...parties.map((p, i) => ({
      width: widthOf(i),
      text: p.caption,
      bold: true,
      align: AlignmentType.CENTER,
    })),
  ]);

  rows.push([
    { width: labelWidth, text: "Name" },
    ...parties.map((p, i) => ({
      width: widthOf(i),
      segments: [value(p.name, { underline: true, fallback: "__________" })],
      align: AlignmentType.CENTER,
    })),
  ]);

  // One tall row carries Designation / Date / Sign / Seal beside the
  // signature, so the image is not split across four separate cells.
  rows.push([
    { width: labelWidth, lines: ["Designation", "Date", "Sign", "Seal"] },
    ...parties.map((p, i) => ({
      width: widthOf(i),
      align: AlignmentType.CENTER,
      ...(p.image ? { image: p.image } : { lines: ["__________", "__________", "__________", "__________"] }),
    })),
  ]);

  return table(rows, { bordered: false, cantSplit: true });
}
