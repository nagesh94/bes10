CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."system_type" AS ENUM('ON_GRID', 'OFF_GRID', 'HYBRID');--> statement-breakpoint
CREATE TABLE "quotation_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"qty" text,
	"make" text,
	"remark" text
);
--> statement-breakpoint
CREATE TABLE "quotation_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"schedule" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_scope_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" text NOT NULL,
	"row_key" text NOT NULL,
	"by_bhim" boolean NOT NULL,
	"by_customer" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"project_id" text,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"quotation_date" date NOT NULL,
	"consumer_title" text,
	"consumer_name" text NOT NULL,
	"consumer_address" text,
	"consumer_phone" text,
	"capacity_kwp" numeric(6, 2) NOT NULL,
	"system_type" "system_type" DEFAULT 'ON_GRID' NOT NULL,
	"metering_policy" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"structure_make" text,
	"panel_company" text,
	"panel_model" text,
	"panel_watt_peak" integer,
	"panel_count" integer,
	"inverter_make" text,
	"inverter_model" text,
	"branch_id" text,
	"vendor_name" text NOT NULL,
	"vendor_address" text NOT NULL,
	"vendor_phones" text NOT NULL,
	"vendor_email" text NOT NULL,
	"vendor_gstin" text,
	"signatory_name" text NOT NULL,
	"bank_name" text,
	"bank_account_no" text,
	"bank_ifsc" text,
	"bank_account_type" text,
	"notes" text,
	"s3_key" text,
	"file_name" text,
	"size_bytes" integer,
	"pdf_generated_at" timestamp,
	"document_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_branches" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "company_branches" ADD COLUMN "bank_account_no" text;--> statement-breakpoint
ALTER TABLE "company_branches" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "company_branches" ADD COLUMN "bank_account_type" text;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_milestones" ADD CONSTRAINT "quotation_milestones_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_scope_overrides" ADD CONSTRAINT "quotation_scope_overrides_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotation_items_quotation_idx" ON "quotation_items" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "quotation_milestones_quotation_idx" ON "quotation_milestones" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_scope_unique" ON "quotation_scope_overrides" USING btree ("quotation_id","row_key");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_idx" ON "quotations" USING btree ("number");--> statement-breakpoint
CREATE INDEX "quotations_project_idx" ON "quotations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quotations_created_idx" ON "quotations" USING btree ("created_at");