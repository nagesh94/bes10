import { Document, Packer, Paragraph, Table } from "docx";
import {
  AlignmentType,
  NUMBERING_CONFIG,
  PAGE_LETTERHEAD,
  SIZE,
  blankLine,
  body,
  centred,
  letterheadSection,
  listItem,
  rich,
  table,
  value,
} from "./docx-kit";
import { addressWithState, type DocContext } from "./context";

/**
 * The ALMM declaration.
 *
 * The only one of the set on company letterhead — that was explicit, and it
 * is right: this is our declaration to whomsoever it may concern, not a
 * DISCOM form we are filling in.
 *
 * The four clauses are MNRE's wording and are reproduced exactly, including
 * the bracketed prompts "(capacity of project)" and "(address of
 * installation)" that the original leaves in place around the merged values.
 * Removing them would read better and would no longer match the declaration
 * the department expects.
 */
export async function buildAlmmDeclarationDocx(ctx: DocContext): Promise<Buffer> {
  const { install } = ctx;

  const children: Array<Paragraph | Table> = [
    centred([{ text: "Declaration", bold: false }], { spacing: { after: 240 } }),
    centred([{ text: "To whomsoever this may concern", bold: true }], { spacing: { after: 240 } }),

    rich(
      [
        { text: "Reference: ", bold: true },
        { text: "Simplified procedure of MNRE for installation of rooftop solar project" },
      ],
      { spacing: { after: 240 } },
    ),

    listItem([
      { text: "We hereby declare that we are fully aware of the binding provisions of the ALMM order and the Lists thereunder, while installing the rooftop solar system of (capacity of project) " },
      { text: install.totalCapacityKw ? `${install.totalCapacityKw} kW` : "____", bold: true },
      { text: " capacity at the residence " },
      { text: addressWithState(ctx), bold: true },
      { text: " (address of installation)." },
    ]),
    listItem([
      {
        text: "We understand that the List – I (Solar PV Modules) of ALMM Order, Annexure – I of the OM, issued by MNRE on 10th March 2021 will be updated by MNRE from time to time. We also understand that the Modules to be procured for this project, shall be from the List – I of the ALMM order applicable on the date of invoicing of such modules.",
      },
    ]),
    listItem([
      {
        text: "We further understand and accept that we shall be liable for penal action, including but not limited to blacklisting, if we are found not complying with the provisions of ALMM Order, including those mentioned above.",
      },
    ]),
    listItem([
      { text: "The details of SPV modules installed at the site are as follows: " },
      { text: `Make: ${install.panelCompany ?? ""}`, bold: true },
      { text: " , " },
      {
        text: `Capacity: ${install.panelWattPeak === null ? "" : `${install.panelWattPeak} Wp`}`,
        bold: true,
      },
      { text: ", " },
      {
        text: `Quantity: ${
          install.totalPanels === null ? "" : String(install.totalPanels).padStart(2, "0")
        } Nos`,
        bold: true,
      },
      { text: " and " },
      { text: "S. No", bold: true },
      { text: " of each module to be mentioned  : see table" },
    ]),
    blankLine(160),

    serialTable(ctx.panelSerials),
    blankLine(400),

    body(`For M/s ${ctx.vendor.name}`, {
      indent: { left: 5040 },
      spacing: { after: 60 },
      keepNext: true,
    }),
    body(`Name – ${ctx.vendor.signatoryName}`, { indent: { left: 5040 }, spacing: { after: 0 } }),
  ];

  const doc = new Document({
    creator: ctx.vendor.name,
    title: `ALMM Declaration — ${ctx.projectCode}`,
    numbering: NUMBERING_CONFIG,
    styles: { default: { document: { run: { font: "Times New Roman", size: SIZE.body } } } },
    sections: [
      {
        properties: PAGE_LETTERHEAD,
        ...(await letterheadSection(ctx.vendor)),
        children,
      },
    ],
  });

  return Packer.toBuffer(doc).then((b) => Buffer.from(b));
}

/**
 * The module serial table.
 *
 * Narrow and left-aligned, with a centred bold header, as in both originals.
 * Every serial is listed because the declaration is per module — the whole
 * point is that these specific panels came off List I.
 */
export function serialTable(
  serials: string[],
  opts: { widthPercent?: number; dense?: boolean } = {},
): Table {
  const rows = serials.length ? serials : [""];
  return table(
    [
      [
        { text: "S No.", bold: true, align: AlignmentType.CENTER, width: 25 },
        { text: "Serial No.", bold: true, align: AlignmentType.CENTER, width: 75 },
      ],
      ...rows.map((s, i) => [
        { text: String(i + 1), align: AlignmentType.CENTER, width: 25 },
        { text: s, width: 75 },
      ]),
    ],
    { widthPercent: opts.widthPercent ?? 46, dense: opts.dense ?? false },
  );
}

export { value };
