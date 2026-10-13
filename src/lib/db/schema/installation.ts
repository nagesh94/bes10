import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { projects } from "./core";
import { cableCategoryEnum, inverterPhaseEnum, structureMemberEnum } from "./enums";

/**
 * Stage 3 — what actually went on the roof.
 *
 * Nearly every field here is printed verbatim into the work completion
 * report, which is why things like "size & type" are stored as the string
 * the DISCOM expects rather than being reassembled at print time.
 */
export const installations = pgTable("installations", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  installationDate: date("installation_date"),

  // Panels
  panelCompany: text("panel_company"),
  panelModelNo: text("panel_model_no"),
  panelWattPeak: integer("panel_watt_peak"),
  totalPanels: integer("total_panels"),
  totalCapacityKw: numeric("total_capacity_kw", { precision: 8, scale: 2 }),

  // Inverter
  inverterManufacturer: text("inverter_manufacturer"),
  inverterBrand: text("inverter_brand"),
  inverterModelNo: text("inverter_model_no"),
  inverterSerial: text("inverter_serial"),
  inverterCapacityKw: numeric("inverter_capacity_kw", { precision: 8, scale: 2 }),
  inverterCount: integer("inverter_count").default(1),
  inverterPhase: inverterPhaseEnum("inverter_phase"),
  isHybrid: boolean("is_hybrid").notNull().default(false),

  // Structure — members are rows of their own; this is what is true once.
  structureCompany: text("structure_company"),
  legCount: integer("leg_count"),

  // Distribution boxes
  acdbMake: text("acdb_make"),
  acdbSizeType: text("acdb_size_type"),
  acdbSpd: text("acdb_spd"),
  acdbMcb: text("acdb_mcb"),
  dcdbMake: text("dcdb_make"),
  dcdbSizeType: text("dcdb_size_type"),
  dcdbSpd: text("dcdb_spd"),
  dcdbMcb: text("dcdb_mcb"),

  // Module procurement. Only the DCR undertaking (Annexure-I) asks for these,
  // and it asks for all four by name — the declaration is a statement that
  // these specific cells were domestically made, so it cannot be signed
  // without the purchase order and the cell manufacturer behind it.
  purchaseOrderNo: text("purchase_order_no"),
  purchaseOrderDate: date("purchase_order_date"),
  cellManufacturer: text("cell_manufacturer"),
  cellGstInvoiceNo: text("cell_gst_invoice_no"),

  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** One row per module. Scanned on site rather than typed. */
export const panelSerials = pgTable(
  "panel_serials",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    serialNo: text("serial_no").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("panel_serials_project_idx").on(t.projectId)],
);

/**
 * Column, rafter and purlin are the same shape: any number of runs, each
 * with its own size, length and count.
 *
 * A 3 kW roof commonly has four columns at four different lengths, so this
 * can never be three fixed "size" fields on `installations`.
 */
export const structureMembers = pgTable(
  "structure_members",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberType: structureMemberEnum("member_type").notNull(),
    size: text("size"),
    lengthM: numeric("length_m", { precision: 8, scale: 2 }),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("structure_members_project_idx").on(t.projectId, t.memberType)],
);

/** Only when the system is hybrid. */
export const batteryBanks = pgTable("battery_banks", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  manufacturer: text("manufacturer"),
  batteryType: text("battery_type"),
  cellCapacity: text("cell_capacity"),
  seriesCount: integer("series_count"),
  parallelCount: integer("parallel_count"),
  totalCapacity: text("total_capacity"),
  totalVoltage: text("total_voltage"),
  commissionedOn: date("commissioned_on"),
});

export const batterySerials = pgTable(
  "battery_serials",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    serialNo: text("serial_no").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("battery_serials_project_idx").on(t.projectId)],
);

/**
 * Stage 4 — what was actually consumed.
 *
 * Make, size, core and conductor are separate columns because the work
 * completion report asks for "Make / Name of manufacturer" and "Size & Type"
 * as distinct lines.
 */
export const materialConsumption = pgTable(
  "material_consumption",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: cableCategoryEnum("category").notNull(),
    make: text("make"),
    lengthM: numeric("length_m", { precision: 8, scale: 2 }),
    sizeSqmm: text("size_sqmm"),
    coreType: text("core_type"),
    conductor: text("conductor"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("material_project_idx").on(t.projectId)],
);

/**
 * Earthing, measured on site.
 *
 * The DISCOM limit is under 2 ohms, and the figure is printed into the work
 * completion report — so it is gated rather than merely stored.
 */
export const earthingRecords = pgTable("earthing_records", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  resistanceOhms: numeric("resistance_ohms", { precision: 6, scale: 2 }),
  wireSize: text("wire_size"),
  wireType: text("wire_type"),
  twoSeparatePoints: boolean("two_separate_points").notNull().default(true),
  cautionSignage: boolean("caution_signage").notNull().default(true),
  omManualProvided: boolean("om_manual_provided").notNull().default(true),
  measuredOn: date("measured_on"),
  completedAt: timestamp("completed_at"),
});
