CREATE TABLE "channel_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"bank_account_number" text,
	"ifsc_code" text,
	"upi_id" text,
	"pan_number" text,
	"commission_basis" "commission_basis" DEFAULT 'PER_KW' NOT NULL,
	"commission_rate" numeric(12, 2),
	"user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" "commission_status" DEFAULT 'ACCRUED' NOT NULL,
	"basis" "commission_basis" NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"plant_kw" numeric(6, 2),
	"amount" numeric(12, 2) NOT NULL,
	"accrued_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"paid_reference" text,
	"cancelled_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "referred_by_partner_id" text;--> statement-breakpoint
ALTER TABLE "channel_partners" ADD CONSTRAINT "channel_partners_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_partners" ADD CONSTRAINT "channel_partners_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partners_active_idx" ON "channel_partners" USING btree ("active");--> statement-breakpoint
CREATE INDEX "commissions_partner_idx" ON "commissions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "commissions_project_idx" ON "commissions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "commissions_status_idx" ON "commissions" USING btree ("status");