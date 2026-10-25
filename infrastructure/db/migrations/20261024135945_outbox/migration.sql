CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"queue" text NOT NULL,
	"job_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outbox_created_at_index" ON "outbox" ("created_at");