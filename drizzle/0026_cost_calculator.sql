CREATE TABLE "cost_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cost_rates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "project_cost_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unit" text NOT NULL,
	"rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_cost_lines" ADD CONSTRAINT "project_cost_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_lines_project_idx" ON "project_cost_lines" USING btree ("project_id");--> statement-breakpoint
-- Starting rates, in rupees. Placeholders to be corrected from Admin →
-- Master data → Rate card with the dealers' actual prices.
INSERT INTO "cost_rates" ("code", "label", "unit", "rate", "sort_order") VALUES
	('PANEL', 'Solar panels', 'W', 26, 10),
	('INVERTER', 'Inverter', 'kW', 9000, 20),
	('STRUCTURE', 'Mounting structure', 'kW', 6000, 30),
	('DCDB', 'DCDB', 'piece', 3500, 40),
	('ACDB', 'ACDB', 'piece', 3000, 50),
	('WIRE_DC', 'DC cable', 'm', 55, 60),
	('WIRE_AC', 'AC cable', 'm', 95, 70),
	('WIRE_LA', 'Lightning arrester cable', 'm', 45, 80),
	('WIRE_EARTHING', 'Earthing cable', 'm', 40, 90),
	('PIPE', 'Conduit pipe', 'pipe', 120, 100),
	('EARTHING', 'Earthing kit (pit, rod, chemical)', 'pit', 2500, 110),
	('LA', 'Lightning arrester', 'piece', 1500, 120);
