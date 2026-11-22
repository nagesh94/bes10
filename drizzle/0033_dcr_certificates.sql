ALTER TYPE "public"."flag_type" ADD VALUE 'DCR_SERIAL_MISMATCH';--> statement-breakpoint
CREATE TABLE "dcr_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificate_no" text NOT NULL,
	"revision" text DEFAULT '00' NOT NULL,
	"cert_type" text,
	"cert_date" date,
	"supplier_id" integer,
	"issued_to_name" text,
	"issued_to_gstin" text,
	"purchase_order_no" text,
	"purchase_order_date" date,
	"invoice_ref" text,
	"invoice_date" date,
	"cell_manufacturer" text,
	"cell_manufacturer_address" text,
	"module_manufacturer" text,
	"module_manufacturer_address" text,
	"model_no" text,
	"module_description" text,
	"watt_peak" integer,
	"efficiency" numeric(5, 2),
	"technology" text,
	"cell_model" text,
	"quantity" integer,
	"total_kw" numeric(10, 2),
	"chain" jsonb,
	"file_name" text,
	"s3_key" text,
	"size_bytes" integer,
	"extracted" jsonb,
	"extraction_method" text,
	"notes" text,
	"uploaded_by" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dcr_serials" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificate_id" integer NOT NULL,
	"serial_no" text NOT NULL,
	"watt_peak" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"gstin" text,
	"pan" text,
	"address" text,
	"state" text,
	"pincode" text,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dcr_certificates" ADD CONSTRAINT "dcr_certificates_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dcr_certificates" ADD CONSTRAINT "dcr_certificates_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dcr_serials" ADD CONSTRAINT "dcr_serials_certificate_id_dcr_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."dcr_certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dcr_certificates_no_idx" ON "dcr_certificates" USING btree ("certificate_no");--> statement-breakpoint
CREATE INDEX "dcr_certificates_supplier_idx" ON "dcr_certificates" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dcr_serials_serial_idx" ON "dcr_serials" USING btree ("serial_no");--> statement-breakpoint
CREATE INDEX "dcr_serials_certificate_idx" ON "dcr_serials" USING btree ("certificate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_gstin_idx" ON "suppliers" USING btree ("gstin");