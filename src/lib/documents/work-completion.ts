import { Document, Packer, Paragraph, Table } from "docx";
import {
  AlignmentType,
  NUMBERING_CONFIG,
  PAGE,
  SIZE,
  blankLine,
  body,
  formatDate,
  justified,
  listItem,
  numberedTable,
  rich,
  run,
  sectionHeading,
  subItem,
  table,
  title,
} from "./docx-kit";
import { consumerWithTitle, fullAddress, materialFor, sizeAndType, type DocContext } from "./context";

/**
 * The work completion report.
 *
 * The DISCOM's own form and the longest of the set — it is what gets the
 * system inspected and commissioned. Reproduced from the supplied original:
 * sections lettered A to M, decimal sub-items beneath each, and three
 * bordered tables for the battery bank, the earthing and the net meter.
 *
 * Two things that look like mistakes are deliberate, because the original
 * does them:
 *
 *   "Madya/Paschim/Poorv"  all three zones are printed and the clerk strikes
 *                          two through. An earlier version of this file
 *                          printed only the project's own zone, which is
 *                          tidier and wrong — this is a pre-printed DISCOM
 *                          form and is not ours to improve.
 *   Net meter rows         left empty. The bi-directional meter is fitted and
 *                          lab-tested by the DISCOM after this report goes
 *                          in, so none of its seven fields can be known now.
 */
export async function buildWorkCompletionDocx(ctx: DocContext): Promise<Buffer> {
  const { install, earthing, battery } = ctx;
  const dc = materialFor(ctx, "DC");
  const ac = materialFor(ctx, "AC");
  const installedOn = formatDate(install.installationDate, "-");

  const children: Array<Paragraph | Table> = [
    title("Work Completion Report"),

    body("To,", { spacing: { after: 240 }, indent: { left: 360 } }),
    body("The Executive Engineer", { spacing: { after: 20 }, indent: { left: 1080 } }),
    body(ctx.discom.executiveEngineerLine ?? "", { spacing: { after: 20 }, indent: { left: 1080 } }),
    body("Madhya Pradesh Madya/Paschim/Poorv Vidyut Vitran Company", {
      spacing: { after: 240 },
      indent: { left: 1080 },
    }),
    body("Sir/Madam.", { spacing: { after: 200 }, indent: { left: 360 } }),

    rich(
      [
        { text: "Sub:\t", bold: true },
        {
          text: "Submission of work completion report (to be submitted by the applicant) for system documentation requirements.",
          bold: true,
        },
      ],
      {
        indent: { left: 1080, hanging: 720 },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 60 },
      },
    ),
    rich(
      [{ text: "Ref:\t" }, { text: `Our Application Registration No.: ${ctx.nationalPortalId ?? ""}` }],
      { indent: { left: 1080, hanging: 720 }, spacing: { after: 240 } },
    ),

    justified(
      [
        {
          text: "With reference to the above, I hereby confirm to you that we have completed the work of installation of the renewable energy system and submit the following basic information for your perusal and request you to arrange to inspect and commission the system at the earliest:",
        },
      ],
      { indent: { left: 360, firstLine: 719 }, spacing: { after: 200 } },
    ),

    sectionHeading([{ text: "Details of the Solar PV module" }]),
    subItem([{ text: `Model No. ${install.panelModelNo ?? ""}` }]),
    subItem([{ text: `Name and address of manufacturer: ${install.panelCompany ?? ""}` }]),
    subItem([
      {
        text: `Capacity of each Module (Wp) : ${install.panelWattPeak === null ? "" : install.panelWattPeak}`,
      },
    ]),
    subItem([{ text: `No. of Modules: ${install.totalPanels === null ? "" : install.totalPanels}` }]),
    subItem([{ text: `Total Capacity (kWp): ${install.totalCapacityKw ?? ""}` }]),
    subItem([{ text: `Date of installation: ${installedOn}` }]),

    sectionHeading([{ text: "Details of the Inverter" }]),
    subItem([
      { text: `Name and address of the inverter manufacturer: ${install.inverterManufacturer ?? ""}` },
    ]),
    subItem([{ text: `Brand Name of the inverter: ${install.inverterBrand ?? ""}` }]),
    subItem([{ text: `Model No. ${install.inverterModelNo ?? ""}` }]),
    subItem([
      {
        text: `AC capacity of individual inverter (kW): ${
          install.inverterCapacityKw ? `${install.inverterCapacityKw}kw` : ""
        }`,
      },
    ]),
    subItem([
      {
        text: `No. of inverters installed :${install.inverterCount === null ? "" : install.inverterCount}`,
      },
    ]),
    subItem([{ text: `Total AC capacity of inverter (kW) :${totalAcCapacity(install)}` }]),
    subItem([{ text: `Serial Nos. ${install.inverterSerial ?? ""}` }]),
    subItem([{ text: `Date of installation ${installedOn}` }]),

    sectionHeading([{ text: "Details of the Cables: DC" }]),
    subItem([{ text: `Make / Name of manufacturer: ${dc?.make ?? ""}` }]),
    subItem([{ text: `Size & Type: ${sizeAndType(dc)}` }]),

    sectionHeading([{ text: "Details of the AC wiring" }]),
    subItem([{ text: `Make/Name of manufacturer : ${ac?.make ?? ""}` }]),
    subItem([{ text: `Size & Type : ${sizeAndType(ac)}` }]),

    sectionHeading([{ text: "Details of the DC distribution box" }]),
    subItem([{ text: `Make/Name of manufacturer : ${install.dcdbMake ?? ""}` }]),
    subItem([{ text: "Sl. No. NA" }]),
    subItem([{ text: `DC Surge Protection Device: ${install.dcdbSpd ?? ""}` }]),
    subItem([{ text: `MCB/Isolator quantity & capacity : ${install.dcdbMcb ?? ""}` }]),
    subItem([{ text: `Size & Type : ${install.dcdbSizeType ?? ""}` }]),

    sectionHeading([{ text: "Details of the AC distribution box" }]),
    subItem([{ text: `Make/Name of manufacturer : ${install.acdbMake ?? ""}` }]),
    subItem([{ text: "Sl. No. N.A." }]),
    subItem([{ text: `AC Surge Protection Device : ${install.acdbSpd ?? ""}` }]),
    subItem([{ text: `MCB/MCCB quantity & capacity: ${install.acdbMcb ?? ""}` }]),
    subItem([{ text: `Size & Type: ${install.acdbSizeType ?? ""}` }]),

    // G keeps its four text items and then a four-row table, exactly as the
    // original splits them. On a non-hybrid job every value is empty and the
    // section still prints — the form is lettered, so dropping it would
    // renumber everything after it.
    sectionHeading([{ text: "Details of Battery Bank (if applicable)" }]),
    subItem([{ text: `Make / Name of manufacturer${suffix(battery?.manufacturer)}` }]),
    subItem([{ text: `Type of battery${suffix(battery?.batteryType)}` }]),
    subItem([
      { text: `Sr. Nos.${suffix(battery?.serials.length ? battery.serials.join(", ") : null)}` },
    ]),
    subItem([{ text: `Capacity of each Cell (V / AH)${suffix(battery?.cellCapacity)}` }]),
    blankLine(80),
    numberedTable([
      { label: "Number of Cells in series", value: numOrBlank(battery?.seriesCount) },
      { label: "Number of Cells in parallel", value: numOrBlank(battery?.parallelCount) },
      { label: "Total capacity in AH", value: battery?.totalCapacity ?? "" },
      { label: "Total battery bank voltage", value: battery?.totalVoltage ?? "" },
    ]),
    blankLine(160),

    sectionHeading([{ text: "Details of the Earthing" }]),
    blankLine(80),
    numberedTable([
      {
        label: "Earth resistance (Shall be less than 2 ohms)",
        value: earthing?.resistanceOhms ? `${earthing.resistanceOhms} ohms` : "",
      },
      { label: "Size of the Earth wire / flat*", value: earthing?.wireSize ?? "" },
      {
        label: [
          "Two separate Earthing points",
          "Modules & DC Surge arrester",
          "Inverter, AC Surge protection device &",
          "Lightening Arrester",
        ],
        value: earthing ? (earthing.twoSeparatePoints ? "Yes" : "No") : "",
      },
      { label: "Size & Type", value: earthing?.wireType ?? "" },
    ]),
    blankLine(160),

    sectionHeading([
      {
        text: "Details of the Net meter details (please enclose the test report of the bi-directional meter tested at the laboratory of the Discom)",
      },
    ]),
    blankLine(80),
    numberedTable([
      { label: "Make" },
      { label: "Serial No." },
      { label: "Capacity" },
      { label: "Type / Model" },
      { label: "Single ph. / Three ph." },
      { label: "CT Ratio" },
      { label: "Date of Test by MT, Discom" },
    ]),
    blankLine(160),

    sectionHeading([{ text: "Details of the Caution signage" }]),
    sectionHeading([
      {
        text: `Provision of manual and automatic switches: ${
          earthing ? (earthing.cautionSignage ? "Yes" : "No") : ""
        }`,
      },
    ]),
    sectionHeading([{ text: "G.P.S. Co-ordinates of the Renewable Energy System Installation" }]),
    rich(
      [
        { text: `(i) Latitude: ${ctx.geo?.latitude ?? ""}` },
        { text: "\t\t" },
        { text: `(ii) Longitude: ${ctx.geo?.longitude ?? ""}` },
      ],
      { indent: { left: 1080 }, spacing: { after: 120 } },
    ),
    sectionHeading([
      {
        text: `Whether Operation and Maintenance Manual provided to the consumer: ${
          earthing ? (earthing.omManualProvided ? "Yes" : "No") : ""
        }`,
      },
    ]),
    blankLine(160),

    justified(
      [
        {
          text: "Certified that the above said renewable energy system was installed and the equipment used complies with the Technical and Safety standards as specified by the Discom under net metering program.",
        },
      ],
      { indent: { left: 360 }, spacing: { after: 240 }, keepNext: true },
    ),

    // Applicant on the left, installer on the right — the order the original
    // puts them in, which is the reverse of the usual.
    table(
      [
        [
          {
            width: 50,
            ...(ctx.signatures.consumer ? { image: ctx.signatures.consumer } : {}),
            lines: ["", "Signature of the Applicant", "Name and Address with Seal"],
          },
          {
            width: 50,
            ...(ctx.signatures.vendor ? { image: ctx.signatures.vendor } : {}),
            lines: ["", "Name and Signature of the System Installer", "Name of the firm and address"],
          },
        ],
        [
          { width: 50, bold: true, lines: [consumerWithTitle(ctx, false), fullAddress(ctx, false)] },
          { width: 50, bold: true, lines: [ctx.vendor.name, ...ctx.vendor.addressLines] },
        ],
      ],
      { bordered: false, cantSplit: true },
    ),
    blankLine(400),

    new Paragraph({
      spacing: { after: 80 },
      indent: { left: 360 },
      children: [run("Enclosures:", { bold: true })],
    }),
    listItem([{ text: "Test report of net meter tested at the laboratory of the Discom." }]),
    listItem([{ text: "Copy of the IEC/IS Test certificates of PV modules, Inverter etc." }]),
    listItem([{ text: "Data sheets/Drawing for the array mounting System." }]),
    listItem([{ text: "Actual Single line wiring diagram (SLD) of the SPV System." }]),
    listItem([
      {
        text: "Copy of Maintenance & Operation information manual provided by the System Installer. Copy of Interconnection Agreement on non-judicial stamp paper of Rs. 500/- with Discom.",
      },
    ]),
  ];

  const doc = new Document({
    creator: ctx.vendor.name,
    title: `Work Completion Report — ${ctx.projectCode}`,
    numbering: NUMBERING_CONFIG,
    styles: { default: { document: { run: { font: "Times New Roman", size: SIZE.body } } } },
    sections: [{ properties: PAGE, children }],
  });

  return Packer.toBuffer(doc).then((b) => Buffer.from(b));
}

/** Appends ": value" only when there is one, so empty rows read as the blank form. */
function suffix(v: string | null | undefined): string {
  return v && v.trim() ? `: ${v}` : "";
}

function numOrBlank(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

/**
 * Total AC capacity across the inverters.
 *
 * The form asks for individual and total separately, and on a two-inverter
 * job they genuinely differ. Computed rather than stored so the two lines can
 * never disagree.
 */
function totalAcCapacity(install: DocContext["install"]): string {
  const each = Number(install.inverterCapacityKw);
  const count = install.inverterCount ?? 1;
  if (!Number.isFinite(each) || each <= 0) return "";
  const total = each * count;
  return `${Number.isInteger(total) ? total : total.toFixed(2)}kw`;
}
