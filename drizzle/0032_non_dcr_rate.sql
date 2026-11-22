-- Non-DCR modules (commercial, or residential without subsidy) list at
-- roughly ₹13.5–18/W in 2026 against ₹21–27.5/W for DCR. Starting figure;
-- correct it on the rate card from the dealer's price.
UPDATE "cost_rates" SET "rate" = 16, "label" = 'Solar panels, non-DCR (commercial / no subsidy)', "updated_at" = now() WHERE "code" = 'PANEL_NON_DCR';
--> statement-breakpoint
UPDATE "cost_rates" SET "label" = 'Solar panels, DCR (needed for subsidy)', "updated_at" = now() WHERE "code" = 'PANEL';
