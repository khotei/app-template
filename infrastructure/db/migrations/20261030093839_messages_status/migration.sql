-- Renamed in place, not recreated: a recreated type cannot cast the stored 'completed' rows, and
-- the partial index follows the renamed column by itself.
ALTER TYPE "message_stage" RENAME TO "message_status";--> statement-breakpoint
ALTER TYPE "message_status" RENAME VALUE 'completed' TO 'done';--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "stage" TO "status";
