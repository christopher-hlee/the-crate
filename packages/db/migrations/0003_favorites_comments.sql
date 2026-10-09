CREATE TABLE "comment_reports" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reports_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"record_key" text NOT NULL,
	"video_id" text NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_record_key_video_id_pk" PRIMARY KEY("user_id","record_key","video_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crate_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "yt_videos" ADD COLUMN "channel_id" text;--> statement-breakpoint
ALTER TABLE "yt_videos" ADD COLUMN "channel_title" text;--> statement-breakpoint
ALTER TABLE "yt_videos" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_reports_user" ON "comment_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_record" ON "comments" USING btree ("record_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_user" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "favorites_recent" ON "favorites" USING btree ("user_id","added_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_display_name" ON "profiles" USING btree (lower(regexp_replace("display_name", '[ ._-]', '', 'g')));--> statement-breakpoint
CREATE UNIQUE INDEX "saved_filters_name" ON "saved_filters" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "yt_videos_channel" ON "yt_videos" USING btree ("channel_id");--> statement-breakpoint
-- Keyword search (a Pro filter). The wrappers are IMMUTABLE so they can back expression
-- indexes: array_to_string and concat_ws are only STABLE because of type output functions,
-- which are fixed for text. Queries must call them with exactly these arguments.
CREATE FUNCTION record_search_doc(title text, artist text, label text, track text, styles text[], genres text[])
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple'::regconfig,
    concat_ws(' ', title, artist, label, track, array_to_string(styles, ' '), array_to_string(genres, ' ')))
$$;
--> statement-breakpoint
CREATE FUNCTION video_search_doc(title text, tags text[])
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple'::regconfig, concat_ws(' ', title, array_to_string(tags, ' ')))
$$;
--> statement-breakpoint
CREATE INDEX "record_videos_search" ON "record_videos" USING gin (record_search_doc("title", "artist_display", "label_name", "track_title", "styles", "genres"));
--> statement-breakpoint
-- YouTube titles and tags are API data: the purge nulls them within 30 days.
CREATE INDEX "yt_videos_search" ON "yt_videos" USING gin (video_search_doc("title", "tags")) WHERE "title" IS NOT NULL;
--> statement-breakpoint
-- YouTube's auto-generated "Artist - Topic" channels carry official audio uploads.
CREATE INDEX "yt_videos_topic" ON "yt_videos" ("video_id") WHERE "channel_title" LIKE '% - Topic';
