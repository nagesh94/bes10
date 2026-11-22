ALTER TABLE "expenses" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "s3_key" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "size_bytes" integer;