DROP INDEX "outbox_created_at_index";--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_unsent_created_at_index" ON "outbox" ("created_at") WHERE ("sent_at" is null);