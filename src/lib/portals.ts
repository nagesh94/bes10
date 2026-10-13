/**
 * National portals, which are the same whichever DISCOM a project sits under.
 *
 * DISCOM-specific URLs — name change, load enhancement, meter payment, land
 * records — live in `discom_companies` instead, so a new zone is an admin
 * edit. These four are national and do not vary, so they are code.
 */
export const NATIONAL_PORTALS = {
  /** Where the subsidy application and the document upload both happen. */
  suryaGhar: "https://pmsuryaghar.gov.in/",
  /** NISE Solar DCR portal — where the DCR certificate is raised. */
  dcrModule: "https://solardcrportal.nise.res.in/",
  /** ALMM list, for checking a model is still listed before ordering. */
  almm: "https://mnre.gov.in/approved-list-of-models-and-manufacturers/",
  /** Bank loan application. Never applies to a cash project. */
  janSamarth: "https://www.jansamarth.in/",
} as const;
