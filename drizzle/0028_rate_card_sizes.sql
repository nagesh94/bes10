-- Inverter and structure are bought as one unit at a price set by the
-- system size, not per kW. Each size gets its own rate-card line; the
-- unsized INVERTER / STRUCTURE lines stay as the fallback for sizes that
-- have no price yet (₹0 until one is set).
UPDATE "cost_rates" SET "label" = 'Inverter — other sizes', "unit" = 'piece', "rate" = 0, "sort_order" = 29, "updated_at" = now() WHERE "code" = 'INVERTER';
--> statement-breakpoint
UPDATE "cost_rates" SET "label" = 'Mounting structure — other sizes', "unit" = 'unit', "rate" = 0, "sort_order" = 39, "updated_at" = now() WHERE "code" = 'STRUCTURE';
--> statement-breakpoint
INSERT INTO "cost_rates" ("code", "label", "unit", "rate", "sort_order") VALUES
	('INVERTER_3KW', 'Inverter 3 kW', 'piece', 16500, 21),
	('INVERTER_5KW', 'Inverter 5 kW', 'piece', 26000, 22),
	('STRUCTURE_3KW', 'Mounting structure 3 kW', 'unit', 13000, 31),
	('STRUCTURE_5KW', 'Mounting structure 5 kW', 'unit', 22000, 32)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- ACDB and DCDB come as a pair for ₹2,500, split 1,000 / 1,500.
UPDATE "cost_rates" SET "rate" = 1000, "updated_at" = now() WHERE "code" = 'ACDB';
--> statement-breakpoint
UPDATE "cost_rates" SET "rate" = 1500, "updated_at" = now() WHERE "code" = 'DCDB';
--> statement-breakpoint
-- The lightning arrester comes inside the earthing kit: one kit, one price.
UPDATE "cost_rates" SET "label" = 'Earthing kit (with lightning arrester)', "unit" = 'kit', "rate" = 1500, "updated_at" = now() WHERE "code" = 'EARTHING';
--> statement-breakpoint
DELETE FROM "cost_rates" WHERE "code" = 'LA';
