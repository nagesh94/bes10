import { Document, Packer, Paragraph, Table } from "docx";
import {
  AlignmentType,
  NUMBERING_CONFIG,
  PAGE,
  SIZE,
  annexure,
  blankLine,
  centred,
  formatDate,
  formatDateLong,
  justified,
  rich,
  table,
  value,
} from "./docx-kit";
import { serialTable } from "./almm-declaration";
import { addressWithState, consumerWithTitle, type DocContext } from "./context";

/**
 * Annexure-I — the DCR self-declaration.
 *
 * Generated only for a DCR project. It is a personal undertaking by the
 * signatory that these specific modules were made in India from domestically
 * made cells, with the Central Financial Assistance at stake if it is wrong.
 *
 * The original's clause numbering runs 2, then an inner list 1–8, then 3,
 * then 4. That is not a transcription error on my part — it is how the
 * department's form is written, and renumbering it would make our copy
 * disagree with every other one they receive.
 *
 * The bracketed prompts "[Capacity]" and "[sanction date]" are also kept, for
 * the same reason.
 */
export async function buildDcrUndertakingDocx(ctx: DocContext): Promise<Buffer> {
  const { install, discom } = ctx;
  const capacity = install.totalCapacityKw ? `${install.totalCapacityKw} kW` : "____";

  // "MPCZ, Zone-Betul Urban, Division-Betul South" — assembled from the
  // project's own stored addressing, so a Bhopal job prints Bhopal.
  const issuer = [
    discom.code ?? discom.companyName,
    discom.zoneName ? `Zone-${discom.zoneName}` : null,
    discom.divisionName ? `Division-${discom.divisionName}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const application = [ctx.nationalPortalId, formatDate(ctx.sanctionDate, "-")]
    .filter(Boolean)
    .join(" / ");

  const details: Array<[string, string | null]> = [
    ["PV Module Capacity", install.panelWattPeak === null ? null : `${install.panelWattPeak} Wp`],
    ["Number of PV Modules", install.totalPanels === null ? null : `${install.totalPanels} Nos.`],
    ["Sr No of PV Module ", "See Table"],
    ["PV Module Make", install.panelCompany],
    ["Purchase Order Number", install.purchaseOrderNo],
    ["Purchase Order Date", formatDateLong(install.purchaseOrderDate)],
    ["Cell manufacturer’s name", install.cellManufacturer],
    ["Cell GST Invoice  No", install.cellGstInvoiceNo],
  ];

  const children: Array<Paragraph | Table> = [
    annexure("Annexure-I", false),
    centred(
      [
        {
          text: "Undertaking/Self-Declaration for Domestic Content Requirement (DCR) fulfillment",
          bold: true,
          size: SIZE.title,
        },
      ],
      { spacing: { after: 240 } },
    ),

    justified([
      { text: "This is to certify that " },
      value(ctx.vendor.name, { underline: true }),
      { text: " has installed " },
      value(capacity, { underline: true }),
      { text: " [Capacity] Grid Connected Rooftop Solar PV Power Plant For " },
      value(consumerWithTitle(ctx), { underline: true }),
      { text: " at " },
      value(addressWithState(ctx), { underline: true }),
      { text: " under application number " },
      value(application, { underline: true }),
      { text: " [sanction date] issued by " },
      value(issuer, { underline: true }),
      { text: "." },
    ]),
    blankLine(60),

    justified([
      {
        text: "2. It is hereby undertaken that the PV modules installed for the above-mentioned project are domestically manufactured using domestic manufactured solar cells. The details of installed PV",
      },
    ]),
    justified([{ text: "Modules are follows:" }]),

    ...details.map(([label, val], i) =>
      rich([{ text: `${i + 1}. ${label}: ` }, value(val, { fallback: "" })], {
        spacing: { after: 70, line: 276 },
      }),
    ),

    justified([
      {
        text: "3. The above undertaking is based on the certificate issued by PV Module manufacturer/supplier  while supplying the above mentioned order.",
      },
    ]),
    justified([
      { text: "4. I, " },
      value(ctx.vendor.signatoryName, { underline: true }),
      { text: " on behalf of " },
      value(ctx.vendor.name, { underline: true }),
      {
        text: " further declare that the information given above is true and correct and nothing has been concealed therein. If anything is found incorrect at any stage then the due Central Financial Assistance (CFA) that I have not charged from the consumer can be withheld and appropriate action may be taken against me and my company for wrong declaration. Supporting documents and proof of the above information will be provided as and when requested by MNRE.",
      },
    ]),
    blankLine(160),

    // Serial table on the left, the signatory block beside it on the right.
    footerRow(ctx),
  ];

  const doc = new Document({
    creator: ctx.vendor.name,
    title: `DCR Undertaking (Annexure-I) — ${ctx.projectCode}`,
    numbering: NUMBERING_CONFIG,
    styles: { default: { document: { run: { font: "Times New Roman", size: SIZE.body } } } },
    sections: [{ properties: PAGE, children }],
  });

  return Packer.toBuffer(doc).then((b) => Buffer.from(b));
}

/** Serial table left, signatory block right — the original's closing layout. */
function footerRow(ctx: DocContext): Table {
  const lines: Array<[string, string | null]> = [
    ["Name", ctx.vendor.signatoryName],
    ["Designation", ctx.vendor.signatoryDesignation],
    ["Phone", ctx.vendor.signatoryPhone],
    ["Email", ctx.vendor.email],
  ];

  return table(
    [
      [
        { width: 50, nested: serialTable(ctx.panelSerials, { widthPercent: 100, dense: true }) },
        {
          width: 50,
          align: AlignmentType.LEFT,
          paragraphs: [
            rich([{ text: `For ${ctx.vendor.name}` }], { spacing: { after: 160 } }),
            ...lines.map(([label, val]) =>
              rich([{ text: `${label}: ` }, value(val, { underline: true, fallback: "" })], {
                spacing: { after: 120 },
              }),
            ),
          ],
        },
      ],
    ],
    { bordered: false, cantSplit: true },
  );
}
