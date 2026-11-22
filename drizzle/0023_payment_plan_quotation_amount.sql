-- What the customer was quoted, kept beside the agreed project value: the two
-- routinely differ and the gap is worth seeing. Nullable; prefilled in the UI
-- from the chosen quotation until someone saves the plan.
ALTER TABLE "payment_plans" ADD COLUMN "quotation_amount" numeric(14, 2);