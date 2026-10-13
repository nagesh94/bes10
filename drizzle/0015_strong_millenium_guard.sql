CREATE TYPE "public"."agreement_status" AS ENUM('DRAFT', 'ISSUED', 'SIGNED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "agreement_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"status" "agreement_status" DEFAULT 'DRAFT' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"execution_date" date NOT NULL,
	"consumer_title" text,
	"consumer_name" text NOT NULL,
	"consumer_address" text NOT NULL,
	"branch_id" text,
	"vendor_name" text NOT NULL,
	"vendor_address" text NOT NULL,
	"total_value" numeric(14, 2) NOT NULL,
	"value_source" text,
	"s3_key" text,
	"file_name" text,
	"size_bytes" integer,
	"docx_generated_at" timestamp,
	"document_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_milestones" ADD CONSTRAINT "agreement_milestones_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreement_milestones_agreement_idx" ON "agreement_milestones" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "agreements_project_idx" ON "agreements" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_primary_idx" ON "agreements" USING btree ("project_id") WHERE "agreements"."is_primary" and "agreements"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "agreements_created_idx" ON "agreements" USING btree ("created_at");