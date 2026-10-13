CREATE TABLE "application_details" (
	"project_id" text PRIMARY KEY NOT NULL,
	"national_portal_id" text,
	"application_date" date,
	"sanction_date" date,
	"discom_company_id" integer,
	"region_name" text,
	"circle_name" text,
	"division_name" text,
	"zone_name" text,
	"is_dcr" boolean DEFAULT true NOT NULL,
	"wants_subsidy" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"project_id" text PRIMARY KEY NOT NULL,
	"bank_name" text,
	"account_holder_name" text,
	"account_number" text,
	"ifsc_code" text,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "electricity_connections" (
	"project_id" text PRIMARY KEY NOT NULL,
	"consumer_number" text,
	"name_on_bill" text,
	"sanctioned_load_kw" numeric(6, 2),
	"current_bill_amount" numeric(12, 2),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" "flag_type" NOT NULL,
	"status" "flag_status" DEFAULT 'OPEN' NOT NULL,
	"detail" text,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"waiver_reason" text
);
--> statement-breakpoint
CREATE TABLE "identity_aadhaar" (
	"project_id" text PRIMARY KEY NOT NULL,
	"name_on_aadhaar" text,
	"address_on_aadhaar" text,
	"aadhaar_last4" text,
	"aadhaar_encrypted" text,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "identity_pan" (
	"project_id" text PRIMARY KEY NOT NULL,
	"name_on_pan" text,
	"pan_number" text,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "load_change_requests" (
	"flag_id" integer PRIMARY KEY NOT NULL,
	"current_sanctioned_kw" numeric(6, 2),
	"required_kw" numeric(6, 2),
	"acknowledgement_no" text,
	"applied_at" timestamp,
	"approved_at" timestamp,
	"new_sanctioned_kw" numeric(6, 2)
);
--> statement-breakpoint
CREATE TABLE "name_change_requests" (
	"flag_id" integer PRIMARY KEY NOT NULL,
	"applicant_photo_doc_id" text,
	"khasra_number" text,
	"noc_document_id" text,
	"submitted_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "other_details" (
	"project_id" text PRIMARY KEY NOT NULL,
	"panel_type" text,
	"panel_company" text,
	"panel_model_no" text,
	"meter_type" text,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rooftop_details" (
	"project_id" text PRIMARY KEY NOT NULL,
	"plant_kw" numeric(6, 2),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_surveys" (
	"project_id" text PRIMARY KEY NOT NULL,
	"expected_wire_length_m" numeric(8, 2),
	"ac_cable_length_m" numeric(8, 2),
	"dc_cable_length_m" numeric(8, 2),
	"earthing_length_m" numeric(8, 2),
	"la_length_m" numeric(8, 2),
	"pipes_required" integer,
	"surveyed_by" text,
	"surveyed_on" date,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"doc_class" "document_class" NOT NULL,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"page_count" integer,
	"s3_key_original" text,
	"s3_key_portal" text,
	"s3_key_thumb" text,
	"signed_copy_of" text,
	"supersedes_id" text,
	"template_id" integer,
	"template_version" integer,
	"generated_at" timestamp,
	"uploaded_by" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"portal_uploaded_at" timestamp,
	"verified_by" text,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "external_refs" (
	"project_id" text PRIMARY KEY NOT NULL,
	"dcr_number" text,
	"dcr_issued_on" timestamp,
	"meter_payment_ref" text,
	"meter_paid_on" timestamp,
	"meter_amount" numeric(12, 2),
	"jan_samarth_application_id" text,
	"sanction_number" text,
	"commissioning_cert_no" text,
	"net_meter_serial" text,
	"performance_check_date" timestamp,
	"commissioning_date" timestamp,
	"joint_inspection_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"photo_type" "photo_type" NOT NULL,
	"s3_key_original" text,
	"s3_key_portal" text,
	"s3_key_thumb" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"accuracy_m" numeric(8, 2),
	"captured_at" timestamp,
	"uploaded_by" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"device_info" text
);
--> statement-breakpoint
ALTER TABLE "application_details" ADD CONSTRAINT "application_details_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricity_connections" ADD CONSTRAINT "electricity_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_aadhaar" ADD CONSTRAINT "identity_aadhaar_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_pan" ADD CONSTRAINT "identity_pan_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_change_requests" ADD CONSTRAINT "load_change_requests_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_change_requests" ADD CONSTRAINT "name_change_requests_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_details" ADD CONSTRAINT "other_details_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooftop_details" ADD CONSTRAINT "rooftop_details_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_surveyed_by_user_id_fk" FOREIGN KEY ("surveyed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_refs" ADD CONSTRAINT "external_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flags_project_type_idx" ON "flags" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "flags_status_idx" ON "flags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("project_id","doc_type");--> statement-breakpoint
CREATE INDEX "photos_project_idx" ON "photos" USING btree ("project_id","photo_type");