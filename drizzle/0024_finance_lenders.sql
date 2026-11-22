CREATE TYPE "public"."lender_kind" AS ENUM('PUBLIC_BANK', 'PRIVATE_BANK', 'OTHER_BANK', 'THIRD_PARTY');--> statement-breakpoint
CREATE TABLE "lenders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "lender_kind" DEFAULT 'PUBLIC_BANK' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_applications" ADD COLUMN "lender_id" integer;--> statement-breakpoint
ALTER TABLE "finance_applications" ADD CONSTRAINT "finance_applications_lender_id_lenders_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The starting list. Banks are the ones lending under PM Surya Ghar through
-- Jan Samarth; third-party lenders are the finance companies that write
-- rooftop-solar loans outside it. More are added from Admin → Master data.
INSERT INTO "lenders" ("name", "kind") VALUES
	('State Bank of India', 'PUBLIC_BANK'),
	('Punjab National Bank', 'PUBLIC_BANK'),
	('Bank of Baroda', 'PUBLIC_BANK'),
	('Union Bank of India', 'PUBLIC_BANK'),
	('Canara Bank', 'PUBLIC_BANK'),
	('Bank of India', 'PUBLIC_BANK'),
	('Central Bank of India', 'PUBLIC_BANK'),
	('Indian Bank', 'PUBLIC_BANK'),
	('Indian Overseas Bank', 'PUBLIC_BANK'),
	('UCO Bank', 'PUBLIC_BANK'),
	('Bank of Maharashtra', 'PUBLIC_BANK'),
	('Punjab & Sind Bank', 'PUBLIC_BANK'),
	('HDFC Bank', 'PRIVATE_BANK'),
	('ICICI Bank', 'PRIVATE_BANK'),
	('Axis Bank', 'PRIVATE_BANK'),
	('Kotak Mahindra Bank', 'PRIVATE_BANK'),
	('IDBI Bank', 'PRIVATE_BANK'),
	('IndusInd Bank', 'PRIVATE_BANK'),
	('Yes Bank', 'PRIVATE_BANK'),
	('IDFC FIRST Bank', 'PRIVATE_BANK'),
	('Federal Bank', 'PRIVATE_BANK'),
	('Bandhan Bank', 'PRIVATE_BANK'),
	('RBL Bank', 'PRIVATE_BANK'),
	('South Indian Bank', 'PRIVATE_BANK'),
	('Karnataka Bank', 'PRIVATE_BANK'),
	('Karur Vysya Bank', 'PRIVATE_BANK'),
	('City Union Bank', 'PRIVATE_BANK'),
	('DCB Bank', 'PRIVATE_BANK'),
	('Jammu & Kashmir Bank', 'PRIVATE_BANK'),
	('Madhya Pradesh Gramin Bank', 'OTHER_BANK'),
	('Madhyanchal Gramin Bank', 'OTHER_BANK'),
	('Madhya Pradesh Rajya Sahakari Bank', 'OTHER_BANK'),
	('AU Small Finance Bank', 'OTHER_BANK'),
	('Equitas Small Finance Bank', 'OTHER_BANK'),
	('Ujjivan Small Finance Bank', 'OTHER_BANK'),
	('Jana Small Finance Bank', 'OTHER_BANK'),
	('Bajaj Finserv', 'THIRD_PARTY'),
	('Tata Capital', 'THIRD_PARTY'),
	('HDB Financial Services', 'THIRD_PARTY'),
	('L&T Finance', 'THIRD_PARTY'),
	('Aditya Birla Capital', 'THIRD_PARTY'),
	('Mahindra Finance', 'THIRD_PARTY'),
	('Shriram Finance', 'THIRD_PARTY'),
	('Cholamandalam Finance', 'THIRD_PARTY'),
	('Hero FinCorp', 'THIRD_PARTY'),
	('Poonawalla Fincorp', 'THIRD_PARTY'),
	('Piramal Finance', 'THIRD_PARTY'),
	('Ecofy Finance', 'THIRD_PARTY');
--> statement-breakpoint
-- Loans saved before this had only a typed bank name. Where it matches a
-- lender exactly (ignoring case and spaces), link it; the rest stay as typed.
UPDATE "finance_applications" AS f
SET "lender_id" = l."id"
FROM "lenders" AS l
WHERE f."lender_id" IS NULL
	AND f."bank_name" IS NOT NULL
	AND lower(trim(f."bank_name")) = lower(l."name");
