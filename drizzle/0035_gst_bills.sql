CREATE TABLE "gst_bill_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'goods' NOT NULL,
	"description" text NOT NULL,
	"hsn_sac" text,
	"quantity" numeric(14, 3),
	"unit" text,
	"rate" numeric(14, 2),
	"taxable_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2),
	"cgst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cess" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gst_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text DEFAULT 'purchase' NOT NULL,
	"doc_type" text DEFAULT 'tax_invoice' NOT NULL,
	"invoice_no" text NOT NULL,
	"invoice_date" date NOT NULL,
	"supplier_id" integer,
	"party_name" text NOT NULL,
	"party_gstin" text,
	"our_gstin" text,
	"place_of_supply" text,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"irn" text,
	"ack_no" text,
	"ack_date" date,
	"eway_bill_no" text,
	"buyer_order_no" text,
	"ref_invoice_no" text,
	"ref_invoice_date" date,
	"project_id" text,
	"taxable_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cess" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tcs" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"itc_eligible" boolean DEFAULT true NOT NULL,
	"notes" text,
	"file_name" text,
	"s3_key" text,
	"content_type" text,
	"size_bytes" integer,
	"extracted" jsonb,
	"extraction_method" text,
	"uploaded_by" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "gst_bill_items" ADD CONSTRAINT "gst_bill_items_bill_id_gst_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."gst_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_bills" ADD CONSTRAINT "gst_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_bills" ADD CONSTRAINT "gst_bills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_bills" ADD CONSTRAINT "gst_bills_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gst_bill_items_bill_idx" ON "gst_bill_items" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gst_bills_irn_idx" ON "gst_bills" USING btree ("irn") WHERE "gst_bills"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "gst_bills_date_idx" ON "gst_bills" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "gst_bills_supplier_idx" ON "gst_bills" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "gst_bills_party_gstin_idx" ON "gst_bills" USING btree ("party_gstin");--> statement-breakpoint
CREATE INDEX "gst_bills_project_idx" ON "gst_bills" USING btree ("project_id");