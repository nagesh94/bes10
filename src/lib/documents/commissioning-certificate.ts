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
  justified,
  table,
  value,
} from "./docx-kit";
import { type DocContext } from "./context";

/**
 * Annexure-II — the commissioning certificate.
 *
 * One paragraph of running text with eight merged values, set at one-and-a-
 * half line spacing, then three signature captions down the left.
 *
 * It needs the date of commissioning, which is the one date on these forms
 * that is asked for rather than left blank — the user treats commissioning
 * and the performance check as the same event, so the certificate's
 * "checked for its performance on" line reads the commissioning date
 * (changed 13 Oct 2026; it previously read a separate performance-check
 * field). The nodal officer's block carries no image: the DISCOM signs that
 * in person.
 */
export async function buildCommissioningCertificateDocx(ctx: DocContext): Promise<Buffer> {
  const { install, dates } = ctx;
  const capacity = install.totalCapacityKw ? `${install.totalCapacityKw} KWp` : "____";

  const children: Array<Paragraph | Table> = [
    annexure("Annexure-II"),

    centred([{ text: "COMMISSIONING CERTIFICATE", bold: true }], { spacing: { after: 0 } }),
    centred([{ text: "FOR GRID CONNECTED SOLAR PHOTOVOLTAIC POWER PLANT", bold: true, italics: true }], {
      spacing: { after: 0 },
    }),
    centred([{ text: "(With Net-Metering Facility)", bold: true, italics: true }], {
      spacing: { after: 320 },
    }),

    justified(
      [
        { text: "Certificate that a Grid Connected SPV Power Plant of " },
        value(capacity),
        { text: " capacity has been installed at the site " },
        value(ctx.consumer.address),
        { text: ",District " },
        value(ctx.consumer.district),
        { text: " of " },
        value(ctx.consumer.state ?? "Madhya Pradesh"),
        { text: " Which has been installed by " },
        value(`M/s ${ctx.vendor.name}`),
        { text: " On " },
        value(formatDate(install.installationDate)),
        { text: " The system is as per BIS/MNRE specifications. The system has  been checked for its performance on " },
        value(formatDate(dates.commissioning)),
        {
          text: " with installation of bi-directional meter and it is working satisfactorily. The system is suitable for installation of bi-directional and gross energy meters.",
        },
      ],
      { spacing: { after: 240, line: 360 }, indent: { firstLine: 719 } },
    ),
    blankLine(240),

    // Captions sit under their signature, each block stacked down the page.
    table(
      [
        [
          {
            width: 100,
            ...(ctx.signatures.consumer ? { image: ctx.signatures.consumer } : {}),
            lines: ["", "Signature of the Beneficiary"],
          },
        ],
      ],
      { bordered: false, cantSplit: true },
    ),
    blankLine(320),

    table(
      [
        [
          {
            width: 100,
            ...(ctx.signatures.vendor ? { image: ctx.signatures.vendor } : {}),
            lines: ["", "Signature of the rep. of Supplier", "With name, seal and date"],
          },
        ],
      ],
      { bordered: false, cantSplit: true },
    ),
    blankLine(640),

    centred([{ text: "" }], { alignment: AlignmentType.LEFT }),
    table(
      [
        [
          {
            width: 100,
            lines: ["Signature of the Nodal Officer (Zone)", "With name, seal and date"],
          },
        ],
      ],
      { bordered: false, cantSplit: true },
    ),
  ];

  const doc = new Document({
    creator: ctx.vendor.name,
    title: `Commissioning Certificate (Annexure-II) — ${ctx.projectCode}`,
    numbering: NUMBERING_CONFIG,
    styles: { default: { document: { run: { font: "Times New Roman", size: SIZE.body } } } },
    sections: [{ properties: PAGE, children }],
  });

  return Packer.toBuffer(doc).then((b) => Buffer.from(b));
}
