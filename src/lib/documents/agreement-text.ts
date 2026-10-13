/**
 * The fixed text of the model agreement (Annexure 2).
 *
 * Clauses 1–18 and the consumer undertaking are MNRE boilerplate and are
 * identical for every customer — only the parties, the date and the money
 * change. They are transcribed here verbatim from the signed Varsha Azad
 * copy so the generated document matches what the notary has already
 * attested in the past.
 *
 * Reproduced rather than merged into the supplied .docx because Word had
 * split the variable text across separate runs (`<w:t>Varsha</w:t>` alone),
 * which makes placeholder substitution in that file unreliable.
 */

export const TITLE = "ANNEXURE 2";

export const HEADING =
  "Model Draft Agreement between Consumer & Vendor for installation of grid connected rooftop solar (RTS) project under PM – Surya Ghar: Muft Bijli Yojana";

export const RECITAL_CONSUMER =
  "First Party wishes to install a Grid Connected Rooftop Solar Plant on the rooftop of the residential building of the Consumer under PM Surya Ghar: Muft Bijli Yojana.";

export const RECITAL_VENDOR =
  "Second Party has verified availability of appropriate roof and found it feasible to install a Grid Connected Roof Top Solar plant and that the second party is willing to design, supply, install, test, commission and carry out Operation & Maintenance of the Rooftop Solar plant for 5 year period. On this day, the First Party and Second Party agree to the following:";

export const FIRST_PARTY_DUTIES = [
  "Submission of online application at National Portal for installation of RTS project/system, Submission of application for net-metering and system inspection and upload of the relevant documents on the National Portal of the scheme.",
  "Provide secure storage of the material of the RTS plant delivered at the premises till handover of the system.",
  "Provide access to the Roof Top during installation of the plant, operation & maintenance, testing of the plant and equipment and for meter reading from solar meter, inverter etc.",
  "Provide electricity during plant installation and water for cleaning of the panels.",
  "Report any malfunctioning of the plant to the Vendor during the warranty period.",
  "Pay the amount as per the payment schedule as mutually agreed with the vendor, including any additional amount to the second party for any additional work / customization required depending upon the building condition.",
];

export const SECOND_PARTY_DUTIES: Array<{ heading?: string; text: string }> = [
  {
    text: "The Vendor must follow all the standards and safety guidelines prescribed under state regulations and technical standards prescribed by MNRE for RTS projects, failing which the vendor is liable for blacklisting from participation in the govt. project/ scheme and other penal actions in accordance with the law. The responsibility of supply, installation and commissioning of the rooftop solar project/system in complete compliance with MNRE scheme guidelines lies with the Vendor.",
  },
  {
    heading: "Site Survey:",
    text: " Site visit, survey and development of detailed project report for installation of RTS system. This also includes, feasibility study of roof, strength of roof and shadow free area. If any additional work or customization is involved for the plant installation as per site condition and requirement of the consumer building, the Vendor shall prepare an estimate and can raise separate invoice including GST in addition to the amount towards standard plant cost. The consumer shall pay the amount for such additional work directly to the Vendor.",
  },
  {
    heading: "Design & Engineering:",
    text: " Design of plant along with drawings and selection of components as per standard provided by the DISCOM/SERC/MNRE for best performance and safety of the plant.",
  },
  {
    heading: "Module and Inverter:",
    text: " The solar modules, including the solar cells, should be manufactured in India. Both the solar modules and inverters shall conform to the relevant standards and specifications prescribed by MNRE. Any other requirement, viz. star labelling (solar modules), quality control orders and standards & labelling (inverters) etc., shall also be complied.",
  },
  {
    heading: "Procurement & Supply:",
    text: " Procurement of complete system as per BIS/IS/IEC standard (whatever applicable) & safety guidelines for installation of rooftop solar plants. The supplied materials should comply with all MNRE standards for release of subsidy.",
  },
  {
    heading: "Installation & Civil work:",
    text: " Complete civil work, structure work and electrical work (including drawings) following all the safety and relevant BIS standards.",
  },
  {
    heading: "Documentation (Technical Catalogues/Warranty Certificates/BIS certificates/other test reports etc):",
    text: " All such documents shall be provided to the consumer for online uploading and submission of technical specifications, IEC/BIS report, Sr. Nos, Warranty card of Solar Panel & Inverter, Layout & Electrical SLD, Structure Design and Drawing, Cable and other detailed documents.",
  },
  {
    heading: "Project completion report (PCR):",
    text: " Assisting the consumer in filling and uploading of signed documents (Consumer & Vendor) on the national portal.",
  },
  {
    heading: "Warranty:",
    text: " System warranty certificates should be provided to the consumer. The complete system should be warranted for 5 years from the date of commissioning by DISCOM. Individual component warranty documents provided by the manufacturer shall be provided to the consumer and all possible assistance should be extended to the consumer for claiming the warranty from the manufacturer.",
  },
  {
    heading: "NET meter & Grid Connectivity:",
    text: " Net meter supply/procurement, testing and approvals shall be in the scope of vendor. Grid connection of the plant shall be in the scope of the vendor.",
  },
  {
    heading: "Testing and Commissioning:",
    text: " The vendor shall be present at the time of testing and commissioning by the DISCOM.",
  },
  {
    heading: "Operation & Maintenance:",
    text: " Five (5) years Comprehensive Operation and Maintenance including overhauling, wear and tear and regular checking of healthiness of system at proper interval shall be in the scope of vendor. The vendor shall also educate the consumer on best practices for cleaning of the modules and system maintenance.",
  },
  {
    heading: "Insurance:",
    text: " Any insurance cost pertaining to material transfer/storage before commissioning of the system shall be in the scope of the vendor.",
  },
  {
    heading: "Applicable Standard:",
    text: " The system must meet the technical standards and specifications notified by MNRE. The vendor is solely responsible for supplying component and service which meets the technical standards and specification prescribed by MNRE and State DISCOMs.",
  },
  {
    heading: "Project/system cost & payment terms:",
    text: " The cost of the plant and payment schedule should be mutually discussed and decided between the vendor and consumer. The consumer may opt for milestone-based payment to the vendor and the same shall be included in the agreement.",
  },
  {
    heading: "Dispute:",
    text: " In-case of any dispute between consumer and vendor (in supply/installation/maintenance of system or payment terms), both parties must settle the same mutually or as per law. MNRE/DISCOM shall not be liable for, and would not be a party to any dispute arising between vendor and consumer.",
  },
  {
    heading: "Subsidy / Project Related Documents:",
    text: " Vendor must provide all the documents to consumer and help in uploading the same to National Portal for smooth release of subsidy.",
  },
  {
    heading: "Performance of Plant:",
    text: " The Performance Ratio (PR) of Plant must be 75% at the time of commissioning of the project by DISCOM or its authorised agency. Vendor must provide (returnable basis) radiation sensor with valid calibration certificate of any NABL / International laboratory at the time of commissioning / testing of the plant. Vendor must maintain the PR of the plant till warranty of project i.e. 5 years from the date of commissioning.",
  },
];

export const CONSUMER_UNDERTAKING_INTRO = "Consumer Undertaking";

/** `{vendor}` is replaced with the company name at build time. */
export const CONSUMER_UNDERTAKING = [
  "I have been explained in detail by the authorized representative of {vendor} about the terms and conditions related to solar rooftop installation under the PM Surya Ghar Scheme and electricity billing after solar installation.",
  "Smart Metering is done by DISCOM and electricity bill will be raised on net consumption (import – export units). Balance consumption will be charged as per prevailing domestic tariff slabs of the distribution company (DISCOM). Monthly Fixed charge in electricity bill will be charged on the import unit during the billing cycle, as per domestic tariff slabs.",
  "1 kW plant generates about 4 units per day (~1300-1450 units per year). Generation of the system can depend upon weather, dust in locality, cleanliness of solar panel, shadow on panel and grid availability in day time.",
  "Units generated but not consumed in day time will be exported to the grid, and adjusted in the consumer's electricity bill on monthly basis. Hence export unit will be lower than the generated unit by the system.",
  "Solar panels and Inverter are under warranty from their manufactures only and as per their term and conditions. Warranty does not apply for broken glass of solar panel, generation reduced due to construction changes in location, obstructions, or natural calamities.",
];

export const PAYMENT_HEADING = "Mutually Agreed Terms of Payment";

export const PAYMENT_FIXED_TERMS =
  "19.2. The order value and payment terms are fixed and will not be subject to any adjustment except as approved in writing by Vendor. The payment shall be made only through bankers' cheque/ NEFT / RTGS / online payment portal as intimated by Vendor. No cash payments shall be accepted by Vendor or its Authorised Person.";
