ALTER TABLE "attachments" DROP CONSTRAINT "attachments_message_id_messages_id_fkey";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "chat_id" uuid;--> statement-breakpoint
UPDATE "attachments" SET "chat_id" = "messages"."chat_id" FROM "messages" WHERE "messages"."id" = "attachments"."message_id";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_chat_id_unique" UNIQUE("id","chat_id");--> statement-breakpoint
CREATE INDEX "attachments_chat_id_index" ON "attachments" ("chat_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_chat_id_fk" FOREIGN KEY ("message_id","chat_id") REFERENCES "messages"("id","chat_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_chat_id_check" CHECK (("message_id" is null) = ("chat_id" is null));