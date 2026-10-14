ALTER TABLE "quotations" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;