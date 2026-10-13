CREATE TYPE "public"."cable_category" AS ENUM('AC', 'DC', 'LA', 'EARTHING');--> statement-breakpoint
CREATE TYPE "public"."commission_basis" AS ENUM('PER_KW', 'FLAT_PER_PROJECT');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('ACCRUED', 'DUE', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."document_class" AS ENUM('COLLECTED', 'GENERATED', 'EXECUTED', 'EVIDENCE', 'EXTERNAL', 'PHYSICAL');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'GENERATED', 'PRINTED', 'SIGNED', 'SCANNED', 'UPLOADED_TO_PORTAL', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."finance_status" AS ENUM('NOT_APPLIED', 'APPLIED', 'SANCTIONED', 'DISBURSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('NAME_MISMATCH', 'LOAD_ENHANCEMENT');--> statement-breakpoint
CREATE TYPE "public"."inverter_phase" AS ENUM('SINGLE', 'THREE');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'CONTACTED', 'SURVEY_DONE', 'READY_TO_CONVERT', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_stage" AS ENUM('LEAD', 'PROSPECT', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'hi');--> statement-breakpoint
CREATE TYPE "public"."milestone_trigger" AS ENUM('UPFRONT', 'ON_INSTALL', 'POST_SUBSIDY', 'ON_LOAN_DISBURSAL');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('CASH', 'FINANCE', 'SPLIT');--> statement-breakpoint
CREATE TYPE "public"."payment_received_mode" AS ENUM('CASH', 'UPI', 'CHEQUE', 'NEFT', 'LOAN_DISBURSAL');--> statement-breakpoint
CREATE TYPE "public"."photo_type" AS ENUM('CUSTOMER_WITH_PANEL', 'CUSTOMER_WITH_INVERTER', 'EARTHING_AC', 'EARTHING_DC', 'EARTHING_PIT', 'SITE_OVERVIEW', 'SITE_SURVEY');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'EMPLOYEE', 'INSTALLER', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."segment" AS ENUM('RESIDENTIAL');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('not_started', 'in_progress', 'blocked', 'complete');--> statement-breakpoint
CREATE TYPE "public"."structure_member_type" AS ENUM('COLUMN', 'RAFTER', 'PURLIN');--> statement-breakpoint
CREATE TYPE "public"."subsidy_status" AS ENUM('NOT_APPLIED', 'APPLIED', 'APPROVED', 'RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."template_engine" AS ENUM('DOCX', 'PDF_FORM', 'PDF_OVERLAY');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" "role" DEFAULT 'EMPLOYEE' NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"partner_id" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"project_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"pin_code" text NOT NULL,
	"phones" text NOT NULL,
	"email" text NOT NULL,
	"gstin" text,
	"signatory_name" text NOT NULL,
	"signatory_designation" text NOT NULL,
	"signatory_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"gender" text,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"pin_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_stage_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_no" integer NOT NULL,
	"status" "stage_status" DEFAULT 'not_started' NOT NULL,
	"completed_by" text,
	"completed_at" timestamp,
	"blocked_reason" text
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"contact_id" text NOT NULL,
	"lifecycle_stage" "lifecycle_stage" DEFAULT 'LEAD' NOT NULL,
	"pipeline_stage" integer DEFAULT 1 NOT NULL,
	"stage_entered_at" timestamp DEFAULT now() NOT NULL,
	"segment" "segment" DEFAULT 'RESIDENTIAL' NOT NULL,
	"lead_status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"lead_source" text,
	"interested_plant_kw" text,
	"assigned_employee_id" text,
	"assigned_installer_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stage_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"from_stage" integer,
	"to_stage" integer NOT NULL,
	"actor_id" text,
	"at" timestamp DEFAULT now() NOT NULL,
	"note" text,
	"override_reason" text
);
--> statement-breakpoint
CREATE TABLE "banks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discom_circles" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discom_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"zone_word" text,
	"name_change_url" text,
	"load_enhancement_url" text,
	"meter_portal_url" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discom_divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"circle_id" integer NOT NULL,
	"name" text NOT NULL,
	"executive_engineer_line" text
);
--> statement-breakpoint
CREATE TABLE "discom_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discom_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"division_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"doc_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"engine" text DEFAULT 'DOCX' NOT NULL,
	"on_letterhead" boolean DEFAULT false NOT NULL,
	"s3_key" text NOT NULL,
	"field_map" text,
	"active" boolean DEFAULT true NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inverter_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"manufacturer" text NOT NULL,
	"brand_name" text,
	"model_no" text NOT NULL,
	"capacity_kw" numeric(6, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"model_no" text NOT NULL,
	"watt_peak" integer NOT NULL,
	"is_dcr" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant_sizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"kw" numeric(6, 2) NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_progress" ADD CONSTRAINT "project_stage_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_progress" ADD CONSTRAINT "project_stage_progress_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assigned_employee_id_user_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assigned_installer_id_user_id_fk" FOREIGN KEY ("assigned_installer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_circles" ADD CONSTRAINT "discom_circles_region_id_discom_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."discom_regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_divisions" ADD CONSTRAINT "discom_divisions_circle_id_discom_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."discom_circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_regions" ADD CONSTRAINT "discom_regions_company_id_discom_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."discom_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discom_zones" ADD CONSTRAINT "discom_zones_division_id_discom_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."discom_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_models" ADD CONSTRAINT "panel_models_company_id_panel_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."panel_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_project_idx" ON "audit_log" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_progress_unique" ON "project_stage_progress" USING btree ("project_id","stage_no");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_idx" ON "projects" USING btree ("code");--> statement-breakpoint
CREATE INDEX "projects_lifecycle_idx" ON "projects" USING btree ("lifecycle_stage");--> statement-breakpoint
CREATE INDEX "projects_stage_idx" ON "projects" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "projects_installer_idx" ON "projects" USING btree ("assigned_installer_id");--> statement-breakpoint
CREATE INDEX "stage_history_project_idx" ON "stage_history" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "discom_zones_division_idx" ON "discom_zones" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "templates_type_idx" ON "document_templates" USING btree ("doc_type","version");