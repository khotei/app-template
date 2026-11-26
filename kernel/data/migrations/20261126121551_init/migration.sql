CREATE TYPE "message_author" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "run_status" AS ENUM('queued', 'generating', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "credential_kind" AS ENUM('secret');--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"title" text,
	"context" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chats_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "chats_title_check" CHECK ("title" = btrim("title") and "title" <> '')
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"author" "message_author" NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messages_id_chat_id_unique" UNIQUE("id","chat_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"status" "run_status" NOT NULL,
	"failure" jsonb,
	"assistant_message_id" uuid CONSTRAINT "runs_assistant_message_id_unique" UNIQUE,
	"usage" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "runs_failure_check" CHECK (("status" = 'failed') = ("failure" is not null)),
	CONSTRAINT "runs_assistant_message_id_check" CHECK (("status" = 'done') = ("assistant_message_id" is not null)),
	CONSTRAINT "runs_usage_check" CHECK (("status" = 'done') = ("usage" is not null))
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
CREATE INDEX "chats_user_id_created_at_index" ON "chats" ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "messages_chat_id_created_at_index" ON "messages" ("chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_chat_id_active_index" ON "runs" ("chat_id") WHERE "status" in ('queued', 'generating');--> statement-breakpoint
CREATE INDEX "runs_user_message_id_created_at_index" ON "runs" ("user_message_id","created_at");--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_user_id_fk" FOREIGN KEY ("chat_id","user_id") REFERENCES "chats"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_assistant_message_id_messages_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_chat_id_user_id_fk" FOREIGN KEY ("chat_id","user_id") REFERENCES "chats"("id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_message_id_chat_id_fk" FOREIGN KEY ("user_message_id","chat_id") REFERENCES "messages"("id","chat_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;