CREATE TABLE "battery_banks" (
	"project_id" text PRIMARY KEY NOT NULL,
	"manufacturer" text,
	"battery_type" text,
	"cell_capacity" text,
	"series_count" integer,
	"parallel_count" integer,
	"total_capacity" text,
	"total_voltage" text,
	"commissioned_on" date
);
--> statement-breakpoint
CREATE TABLE "battery_serials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"serial_no" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earthing_records" (
	"project_id" text PRIMARY KEY NOT NULL,
	"resistance_ohms" numeric(6, 2),
	"wire_size" text,
	"wire_type" text,
	"two_separate_points" boolean DEFAULT true NOT NULL,
	"caution_signage" boolean DEFAULT true NOT NULL,
	"om_manual_provided" boolean DEFAULT true NOT NULL,
	"measured_on" date,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"project_id" text PRIMARY KEY NOT NULL,
	"installation_date" date,
	"panel_company" text,
	"panel_model_no" text,
	"panel_watt_peak" integer,
	"total_panels" integer,
	"total_capacity_kw" numeric(8, 2),
	"inverter_manufacturer" text,
	"inverter_brand" text,
	"inverter_model_no" text,
	"inverter_serial" text,
	"inverter_capacity_kw" numeric(8, 2),
	"inverter_count" integer DEFAULT 1,
	"inverter_phase" "inverter_phase",
	"is_hybrid" boolean DEFAULT false NOT NULL,
	"structure_company" text,
	"leg_count" integer,
	"acdb_make" text,
	"acdb_size_type" text,
	"acdb_spd" text,
	"acdb_mcb" text,
	"dcdb_make" text,
	"dcdb_size_type" text,
	"dcdb_spd" text,
	"dcdb_mcb" text,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_consumption" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"category" "cable_category" NOT NULL,
	"make" text,
	"length_m" numeric(8, 2),
	"size_sqmm" text,
	"core_type" text,
	"conductor" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_serials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"serial_no" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"member_type" "structure_member_type" NOT NULL,
	"size" text,
	"length_m" numeric(8, 2),
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battery_banks" ADD CONSTRAINT "battery_banks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battery_serials" ADD CONSTRAINT "battery_serials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earthing_records" ADD CONSTRAINT "earthing_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_serials" ADD CONSTRAINT "panel_serials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_members" ADD CONSTRAINT "structure_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battery_serials_project_idx" ON "battery_serials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "material_project_idx" ON "material_consumption" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "panel_serials_project_idx" ON "panel_serials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "structure_members_project_idx" ON "structure_members" USING btree ("project_id","member_type");