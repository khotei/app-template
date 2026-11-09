CREATE TYPE "message_author" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "run_status" AS ENUM('queued', 'preparing', 'generating', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "credential_kind" AS ENUM('secret');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"message_id" uuid,
	"chat_id" uuid,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attachments_file_name_check" CHECK ("file_name" <> ''),
	CONSTRAINT "attachments_media_type_check" CHECK ("media_type" ~* '^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
	CONSTRAINT "attachments_size_check" CHECK ("size" >= 0),
	CONSTRAINT "attachments_message_id_chat_id_check" CHECK (("message_id" is null) = ("chat_id" is null))
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chats_title_check" CHECK ("title" = btrim("title") and char_length("title") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"chat_id" uuid NOT NULL,
	"author" "message_author" NOT NULL,
	"text" text NOT NULL,
	"run_id" uuid CONSTRAINT "messages_run_id_unique" UNIQUE,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messages_id_chat_id_unique" UNIQUE("id","chat_id"),
	CONSTRAINT "messages_run_id_check" CHECK (("author" = 'assistant') = ("run_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"chat_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"status" "run_status" NOT NULL,
	"failure" jsonb,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "runs_failure_check" CHECK (("status" = 'failed') = ("failure" is not null))
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"hash" text PRIMARY KEY,
	"kind" "credential_kind" NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "credentials_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attachments_chat_id_index" ON "attachments" ("chat_id");--> statement-breakpoint
CREATE INDEX "attachments_message_id_created_at_id_index" ON "attachments" ("message_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chats_user_id_created_at_index" ON "chats" ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "chats_user_id_updated_at_index" ON "chats" ("user_id","updated_at" DESC);--> statement-breakpoint
CREATE INDEX "messages_chat_id_created_at_index" ON "messages" ("chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_chat_id_active_index" ON "runs" ("chat_id") WHERE "status" in ('queued', 'preparing', 'generating');--> statement-breakpoint
CREATE INDEX "runs_user_message_id_created_at_index" ON "runs" ("user_message_id","created_at");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_chat_id_fk" FOREIGN KEY ("message_id","chat_id") REFERENCES "messages"("id","chat_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_id_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_message_id_chat_id_fk" FOREIGN KEY ("user_message_id","chat_id") REFERENCES "messages"("id","chat_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;