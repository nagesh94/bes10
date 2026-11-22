CREATE TABLE "estimates" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"project_id" text,
	"system_type" "system_type" DEFAULT 'ON_GRID' NOT NULL,
	"capacity_kw" numeric(8, 2) NOT NULL,
	"inputs" jsonb NOT NULL,
	"cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"quote_with_gst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"customer_pays" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "estimates_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estimates_project_idx" ON "estimates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "estimates_created_idx" ON "estimates" USING btree ("created_at");--> statement-breakpoint
-- Rates the pre-installation estimator needs beyond what the post-install
-- cost sheet uses. Starting figures from 2026 Indian market listings; set
-- them to the dealers' actual prices from Admin → Master data → Rate card.
INSERT INTO "cost_rates" ("code", "label", "unit", "rate", "sort_order") VALUES
	('PANEL_NON_DCR', 'Solar panels, non-DCR', 'W', 18, 11),
	('INVERTER_ON_GRID_KW', 'On-grid inverter, sizes not priced above', 'kW', 5500, 28),
	('INVERTER_HYBRID_KW', 'Hybrid inverter', 'kW', 16000, 41),
	('INVERTER_OFF_GRID_KW', 'Off-grid PCU', 'kW', 12000, 42),
	('STRUCTURE_KW', 'Mounting structure, sizes not priced above', 'kW', 4400, 38),
	('BATTERY_LEAD_ACID_150AH', 'Tubular battery 12 V 150 Ah', 'piece', 13000, 120),
	('BATTERY_LITHIUM_KWH', 'Lithium (LFP) battery', 'kWh', 22000, 121),
	('BATTERY_RACK', 'Battery rack, links and cabling', 'battery', 600, 122),
	('LABOUR_KW', 'Installation labour', 'kW', 3000, 130),
	('CIVIL_SITE', 'Cement & civil work', 'site', 2000, 131),
	('TRANSPORT_SITE', 'Transportation', 'site', 2500, 132),
	('DISCOM_SITE', 'Electricity department & net meter', 'site', 3500, 133),
	('AGREEMENT_SITE', 'Agreement & documentation', 'site', 1000, 134)
ON CONFLICT ("code") DO NOTHING;
