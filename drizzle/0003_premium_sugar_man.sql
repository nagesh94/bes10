CREATE TABLE "finance_applications" (
	"project_id" text PRIMARY KEY NOT NULL,
	"bank_name" text,
	"loan_amount" numeric(14, 2),
	"status" "finance_status" DEFAULT 'NOT_APPLIED' NOT NULL,
	"applied_on" date,
	"sanctioned_on" date,
	"disbursed_on" date,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"trigger" "milestone_trigger" NOT NULL,
	"due_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"project_id" text PRIMARY KEY NOT NULL,
	"mode" "payment_mode" DEFAULT 'CASH' NOT NULL,
	"total_value" numeric(14, 2),
	"cash_component" numeric(14, 2),
	"finance_component" numeric(14, 2),
	"locked_at" timestamp,
	"locked_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments_received" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"milestone_id" integer,
	"amount" numeric(14, 2) NOT NULL,
	"mode" "payment_received_mode" NOT NULL,
	"received_on" date NOT NULL,
	"reference_no" text,
	"proof_document_id" text,
	"recorded_by" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subsidies" (
	"project_id" text PRIMARY KEY NOT NULL,
	"status" "subsidy_status" DEFAULT 'NOT_APPLIED' NOT NULL,
	"expected_amount" numeric(14, 2),
	"received_amount" numeric(14, 2),
	"received_on" date,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_applications" ADD CONSTRAINT "finance_applications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_milestone_id_payment_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."payment_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subsidies" ADD CONSTRAINT "subsidies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "payment_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payments_project_idx" ON "payments_received" USING btree ("project_id");