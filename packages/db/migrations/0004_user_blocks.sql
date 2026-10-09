CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_id" ON "user_blocks" USING btree ("id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked" ON "user_blocks" USING btree ("blocked_id");