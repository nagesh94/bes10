CREATE TABLE "co_applicants" (
	"project_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"relationship" text,
	"phone" text,
	"email" text,
	"occupation" text,
	"pan_number" text,
	"aadhaar_last4" text,
	"aadhaar_encrypted" text,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "occupation" text;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "has_co_applicant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "co_applicants" ADD CONSTRAINT "co_applicants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;