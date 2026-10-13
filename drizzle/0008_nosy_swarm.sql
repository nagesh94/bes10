CREATE TABLE "project_installers" (
	"project_id" text NOT NULL,
	"installer_id" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" text,
	CONSTRAINT "project_installers_project_id_installer_id_pk" PRIMARY KEY("project_id","installer_id")
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_assigned_installer_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "projects_installer_idx";--> statement-breakpoint
ALTER TABLE "project_installers" ADD CONSTRAINT "project_installers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_installers" ADD CONSTRAINT "project_installers_installer_id_user_id_fk" FOREIGN KEY ("installer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_installers" ADD CONSTRAINT "project_installers_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_installers_installer_idx" ON "project_installers" USING btree ("installer_id");--> statement-breakpoint
-- Carry the single installer each project already had onto the new crew table
-- before the column goes, so nobody loses a job they are standing on today.
INSERT INTO "project_installers" ("project_id", "installer_id")
SELECT "id", "assigned_installer_id" FROM "projects"
WHERE "assigned_installer_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "assigned_installer_id";