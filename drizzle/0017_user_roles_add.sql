ALTER TABLE "user" ADD COLUMN "roles" "role"[] DEFAULT '{"EMPLOYEE"}' NOT NULL;--> statement-breakpoint
-- Every existing account keeps exactly the role it had, now as a one-element
-- set. The column default only covers rows inserted after this point, so
-- without this line everyone already in the table would silently become an
-- executive, the admin included, who would then be unable to put it back.
UPDATE "user" SET "roles" = ARRAY["role"]::"role"[];
