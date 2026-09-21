ALTER TABLE "build_projects" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "build_projects_published_idx" ON "build_projects" USING btree ("published");