CREATE TYPE "job_status" AS ENUM('idle', 'queued', 'done', 'failed');--> statement-breakpoint
DROP INDEX "jobs_unsent_created_at_index";--> statement-breakpoint
-- The default only fills the rows already there: a job the relay sent is in SQS, an unsent one
-- stays idle for the sweep. Every insert names its status.
ALTER TABLE "jobs" ADD COLUMN "status" "job_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "status" = 'queued' WHERE "sent_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "job_id";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "sent_at";--> statement-breakpoint
CREATE INDEX "jobs_idle_created_at_index" ON "jobs" ("created_at") WHERE "status" = 'idle';