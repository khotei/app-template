CREATE TYPE "credential_kind" AS ENUM('secret');--> statement-breakpoint
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
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;