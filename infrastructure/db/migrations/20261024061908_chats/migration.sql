CREATE TYPE "message_author" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "message_stage" AS ENUM('queued', 'preparing', 'generating', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"message_id" uuid,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attachments_file_name_check" CHECK ("file_name" <> ''),
	CONSTRAINT "attachments_media_type_check" CHECK ("media_type" ~* '^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
	CONSTRAINT "attachments_size_check" CHECK ("size" >= 0)
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
	"stage" "message_stage" NOT NULL,
	"text" text NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attachments_message_id_created_at_id_index" ON "attachments" ("message_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chats_user_id_updated_at_index" ON "chats" ("user_id","updated_at" DESC);--> statement-breakpoint
CREATE INDEX "messages_chat_id_created_at_index" ON "messages" ("chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_chat_id_active_index" ON "messages" ("chat_id") WHERE "author" = 'assistant' and "stage" in ('queued', 'preparing', 'generating');--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;