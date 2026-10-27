-- Four changes to the money tables, all on the user's instruction, 27 Oct 2026.
--
-- 1. PSS1 and PSS2 are the two tranches a bank releases a sanctioned loan in.
--    Commonly 70:30, but the ratio is the lender's, so only the names are
--    fixed here — the amounts against them are typed per project.
-- 2. `customer_advances` records money handed *to* the customer. It happens:
--    the office pays a fee on their behalf, or fronts cash against a subsidy
--    that has not landed. It is recoverable, so it is added to what the
--    project owes and cleared by an ordinary payment received.
-- 3. A schedule line is now a trigger and an amount. The label was a second
--    name for the trigger, free to disagree with it, and did.
-- 4. Locking a payment plan is gone. Saving it is the whole act: the office
--    renegotiates right up to signature, and an admin unlock with a written
--    reason in the middle of that was friction with nothing behind it. The
--    stage 1 gate now asks only that a plan exists with a value on it.
ALTER TYPE "public"."milestone_trigger" ADD VALUE 'PSS1' BEFORE 'POST_SUBSIDY';--> statement-breakpoint
ALTER TYPE "public"."milestone_trigger" ADD VALUE 'PSS2' BEFORE 'POST_SUBSIDY';--> statement-breakpoint
ALTER TYPE "public"."payment_received_mode" ADD VALUE 'LOAN_DISBURSAL_PSS1';--> statement-breakpoint
ALTER TYPE "public"."payment_received_mode" ADD VALUE 'LOAN_DISBURSAL_PSS2';--> statement-breakpoint
CREATE TABLE "customer_advances" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"mode" "payment_received_mode" NOT NULL,
	"paid_on" date NOT NULL,
	"reference_no" text,
	"note" text,
	"recorded_by" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_plans" DROP CONSTRAINT "payment_plans_locked_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advances_project_idx" ON "customer_advances" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "payment_milestones" DROP COLUMN "label";--> statement-breakpoint
ALTER TABLE "payment_plans" DROP COLUMN "locked_at";--> statement-breakpoint
ALTER TABLE "payment_plans" DROP COLUMN "locked_by";
--> statement-breakpoint
-- The Jan Samarth sanction letter is no longer a document type of its own:
-- the digital approval letter is the paper the bank file is checked against,
-- and asking for both was asking twice. Anything already filed under the old
-- type moves across rather than being deleted — the file is still the loan
-- paperwork, and left under a type the app no longer knows it would appear on
-- the documents page with a raw key for a label.
UPDATE "documents" SET "doc_type" = 'DIGITAL_APPROVAL_LETTER' WHERE "doc_type" = 'SANCTION_LETTER';--> statement-breakpoint
UPDATE "document_templates" SET "doc_type" = 'DIGITAL_APPROVAL_LETTER' WHERE "doc_type" = 'SANCTION_LETTER';
