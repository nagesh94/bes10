-- Cable, battery and inverter prices by actual size, replacing the single
-- per-kind rates the estimator started with. Starting figures are 2026
-- dealer and marketplace listings (Polycab, Exide, Luminous and similar);
-- correct them from Admin → Master data → Rate card.

-- Generic lines kept for the post-installation cost sheet, now named for
-- what they usually are.
UPDATE "cost_rates" SET "label" = 'DC solar cable 4 sq mm (1-core)', "rate" = 50, "updated_at" = now() WHERE "code" = 'WIRE_DC';
--> statement-breakpoint
UPDATE "cost_rates" SET "label" = 'AC cable 2-core 4 sq mm copper', "rate" = 180, "updated_at" = now() WHERE "code" = 'WIRE_AC';
--> statement-breakpoint
UPDATE "cost_rates" SET "label" = 'Earthing cable 6 sq mm copper', "rate" = 60, "updated_at" = now() WHERE "code" = 'WIRE_EARTHING';
--> statement-breakpoint
UPDATE "cost_rates" SET "label" = 'LA down conductor 16 sq mm aluminium', "rate" = 35, "updated_at" = now() WHERE "code" = 'WIRE_LA';
--> statement-breakpoint
-- Labour is charged per watt on whole kilowatts only.
DELETE FROM "cost_rates" WHERE "code" = 'LABOUR_KW';
--> statement-breakpoint
UPDATE "cost_rates" SET "rate" = 15000, "label" = 'Hybrid inverter, sizes not priced above' WHERE "code" = 'INVERTER_HYBRID_KW';
--> statement-breakpoint
UPDATE "cost_rates" SET "rate" = 8000, "label" = 'Off-grid PCU, sizes not priced above' WHERE "code" = 'INVERTER_OFF_GRID_KW';
--> statement-breakpoint
UPDATE "cost_rates" SET "rate" = 20000, "label" = 'Lithium battery, packs not priced above' WHERE "code" = 'BATTERY_LITHIUM_KWH';
--> statement-breakpoint
UPDATE "cost_rates" SET "rate" = 14100 WHERE "code" = 'BATTERY_LEAD_ACID_150AH';
--> statement-breakpoint
INSERT INTO "cost_rates" ("code", "label", "unit", "rate", "sort_order") VALUES
	('LABOUR_W', 'Installation labour (whole kW only)', 'W', 2, 130),
	('WIRE_DC_4', 'DC solar cable 4 sq mm', 'm', 50, 60),
	('WIRE_DC_6', 'DC solar cable 6 sq mm', 'm', 70, 61),
	('AC_FLEX_2C_4', 'AC cable 2-core 4 sq mm copper flexible', 'm', 180, 70),
	('AC_FLEX_2C_6', 'AC cable 2-core 6 sq mm copper flexible', 'm', 260, 71),
	('AC_FLEX_2C_10', 'AC cable 2-core 10 sq mm copper flexible', 'm', 400, 72),
	('AC_ARM_2C_6', 'Armoured cable 2-core 6 sq mm copper', 'm', 300, 73),
	('AC_ARM_2C_10', 'Armoured cable 2-core 10 sq mm copper', 'm', 380, 74),
	('AC_ARM_4C_6', 'Armoured cable 4-core 6 sq mm copper', 'm', 420, 75),
	('AC_ARM_4C_10', 'Armoured cable 4-core 10 sq mm copper', 'm', 520, 76),
	('AC_ARM_4C_16', 'Armoured cable 4-core 16 sq mm copper', 'm', 750, 77),
	('INVERTER_HYBRID_3KW', 'Hybrid inverter 3 kW (48 V)', 'piece', 50000, 43),
	('INVERTER_HYBRID_5KW', 'Hybrid inverter 5 kW (48 V)', 'piece', 70000, 44),
	('INVERTER_HYBRID_10KW', 'Hybrid inverter 10 kW (48 V)', 'piece', 140000, 45),
	('INVERTER_OFF_GRID_2KW', 'Off-grid PCU 2 kVA (24 V)', 'piece', 17000, 46),
	('INVERTER_OFF_GRID_3KW', 'Off-grid PCU 3 kVA (48 V)', 'piece', 22000, 47),
	('INVERTER_OFF_GRID_5KW', 'Off-grid PCU 5 kVA (48 V)', 'piece', 40000, 48),
	('BATTERY_LEAD_ACID_200AH', 'Tubular battery 12 V 200 Ah', 'piece', 18700, 119),
	('BATTERY_LITHIUM_12_8V_100AH', 'Lithium (LFP) 12.8 V 100 Ah', 'piece', 25000, 123),
	('BATTERY_LITHIUM_25_6V_100AH', 'Lithium (LFP) 25.6 V 100 Ah', 'piece', 50000, 124),
	('BATTERY_LITHIUM_51_2V_100AH', 'Lithium (LFP) 51.2 V 100 Ah', 'piece', 100000, 125),
	('BATTERY_LITHIUM_51_2V_150AH', 'Lithium (LFP) 51.2 V 150 Ah', 'piece', 145000, 126),
	('BATTERY_LITHIUM_51_2V_200AH', 'Lithium (LFP) 51.2 V 200 Ah', 'piece', 185000, 127)
ON CONFLICT ("code") DO NOTHING;
