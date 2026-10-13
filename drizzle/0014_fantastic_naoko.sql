ALTER TABLE "documents" ADD COLUMN "last_modified_by" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "last_modified_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_last_modified_by_user_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;