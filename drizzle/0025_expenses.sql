CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hint" text,
	"needs_person" boolean DEFAULT false NOT NULL,
	"needs_detail" boolean DEFAULT false NOT NULL,
	"per_site" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"spent_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"category_id" integer NOT NULL,
	"project_id" text,
	"paid_to" text,
	"mode" "payment_received_mode" NOT NULL,
	"reference_no" text,
	"person_user_id" text,
	"person_name" text,
	"details" text,
	"recorded_by" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_person_user_id_user_id_fk" FOREIGN KEY ("person_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_spent_on_idx" ON "expenses" USING btree ("spent_on");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
-- The starting categories: where a rooftop-solar installer's money actually
-- goes. Admins add, rename and retire them from Master data afterwards.
INSERT INTO "expense_categories" ("name", "hint", "needs_person", "needs_detail", "per_site", "sort_order") VALUES
	('Material purchase', 'Panels, inverters, cable, ACDB/DCDB, earthing, BOS', false, false, true, 10),
	('Structure & civil work', 'Mounting structure, fabrication, cement, sand, foundation', false, false, true, 20),
	('Transportation & freight', 'Material delivery to site, loading, unloading', false, false, true, 30),
	('Installation labour', 'Per-site installation charges, electrician, helpers', false, false, true, 40),
	('Agreement & documentation', 'Stamp paper, notary, printing, agreement fee', false, false, true, 50),
	('DISCOM / electricity department', 'Net-meter, application, testing, meter fees', false, false, true, 60),
	('Referral payout', 'Money given for a referral or lead', false, false, true, 70),
	('Service & maintenance', 'Panel cleaning, AMC visits, repairs for customers', false, false, true, 80),
	('Miscellaneous equipment & tools', 'Drills, ladders, safety gear, testers', false, false, false, 90),
	('Travel & fuel', 'Site visits, survey trips, vehicle fuel', false, false, false, 100),
	('Salary & wages', 'Monthly salary, advance against salary', true, false, false, 110),
	('Office rent & utilities', 'Rent, electricity, internet, phone', false, false, false, 120),
	('Marketing & lead generation', 'Pamphlets, ads, camps, hoardings', false, false, false, 130),
	('Bank & finance charges', 'Loan file charges, bank fees, transfer charges', false, false, false, 140),
	('Personal use', 'Money taken by someone in the company for personal use', true, true, false, 150),
	('Other', 'Anything that fits nowhere else — say what it was', false, true, false, 999);
