import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Master data. Admin-editable without a deploy — add a panel model and it is
 * live for the next project.
 */

export const panelCompanies = pgTable("panel_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Mono PERC, Bifacial, TOPCon, and so on — the physical technology, not the make. */
export const panelTypes = pgTable("panel_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const panelModels = pgTable("panel_models", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => panelCompanies.id),
  /** Model number as printed, e.g. BiN-08-535. Prints into every document. */
  modelNo: text("model_no").notNull(),
  wattPeak: integer("watt_peak").notNull(),
  isDcr: boolean("is_dcr").notNull().default(true),
  active: boolean("active").notNull().default(true),
});

export const inverterModels = pgTable("inverter_models", {
  id: serial("id").primaryKey(),
  manufacturer: text("manufacturer").notNull(),
  brandName: text("brand_name"),
  modelNo: text("model_no").notNull(),
  capacityKw: numeric("capacity_kw", { precision: 6, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const structureCompanies = pgTable("structure_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Wire/cable makes for the site-evidence material runs — Polycab, KEI, and so on. */
export const cableMakes = pgTable("cable_makes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const banks = pgTable("banks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const plantSizes = pgTable("plant_sizes", {
  id: serial("id").primaryKey(),
  kw: numeric("kw", { precision: 6, scale: 2 }).notNull(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
});

/**
 * DISCOM hierarchy as the portals actually use it:
 *   Region → Circle → Division → Zone/DC
 *
 * Every generated document reads the project's own row, so a Bhopal job
 * prints Bhopal addressing with no template change. The name-change and
 * load-enhancement deep links live here too, so another zone can be added
 * without touching code.
 */
export const discomCompanies = pgTable("discom_companies", {
  id: serial("id").primaryKey(),
  /** e.g. MPMKVVCL */
  code: text("code").notNull(),
  /** Printed on the work completion report. */
  name: text("name").notNull(),
  /** Madhya / Paschim / Poorv — the form asks you to strike through two. */
  zoneWord: text("zone_word"),
  nameChangeUrl: text("name_change_url"),
  loadEnhancementUrl: text("load_enhancement_url"),
  meterPortalUrl: text("meter_portal_url"),
  /** State land records — where the khasra extract is downloaded from. */
  landRecordsUrl: text("land_records_url"),
  active: boolean("active").notNull().default(true),
});

export const discomRegions = pgTable("discom_regions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => discomCompanies.id),
  name: text("name").notNull(),
});

export const discomCircles = pgTable("discom_circles", {
  id: serial("id").primaryKey(),
  regionId: integer("region_id")
    .notNull()
    .references(() => discomRegions.id),
  name: text("name").notNull(),
});

export const discomDivisions = pgTable("discom_divisions", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id")
    .notNull()
    .references(() => discomCircles.id),
  name: text("name").notNull(),
  /** "The Executive Engineer, <this> Dv." on the work completion report. */
  executiveEngineerLine: text("executive_engineer_line"),
});

export const discomZones = pgTable(
  "discom_zones",
  {
    id: serial("id").primaryKey(),
    divisionId: integer("division_id")
      .notNull()
      .references(() => discomDivisions.id),
    name: text("name").notNull(),
  },
  (t) => [index("discom_zones_division_idx").on(t.divisionId)],
);

/**
 * Document templates, versioned. Old projects keep the version they were
 * generated with, so a reworded agreement never rewrites history.
 */
export const documentTemplates = pgTable(
  "document_templates",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    docType: text("doc_type").notNull(),
    version: integer("version").notNull().default(1),
    engine: text("engine").notNull().default("DOCX"),
    /** True only for the ALMM declaration. The rest print plain. */
    onLetterhead: boolean("on_letterhead").notNull().default(false),
    s3Key: text("s3_key").notNull(),
    fieldMap: text("field_map"),
    active: boolean("active").notNull().default(true),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  },
  (t) => [index("templates_type_idx").on(t.docType, t.version)],
);
