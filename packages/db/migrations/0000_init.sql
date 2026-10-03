CREATE TABLE "account_deletions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"draft" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crate_items" (
	"crate_id" uuid NOT NULL,
	"record_key" text NOT NULL,
	"video_id" text NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crate_items_crate_id_record_key_video_id_pk" PRIMARY KEY("crate_id","record_key","video_id")
);
--> statement-breakpoint
CREATE TABLE "crates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb,
	"seed" bigint,
	"share_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crates_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE "history" (
	"user_id" uuid NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"record_key" text NOT NULL,
	"video_id" text NOT NULL,
	"seconds" real,
	CONSTRAINT "history_user_id_played_at_pk" PRIMARY KEY("user_id","played_at")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"dump_date" date PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"sha256" text,
	"releases_seen" integer,
	"records" integer,
	"record_videos" integer,
	"added_records" integer,
	"removed_records" integer,
	"new_video_ids" integer,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "link_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"record_key" text NOT NULL,
	"video_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"record_key" text NOT NULL,
	"video_id" text NOT NULL,
	"at_seconds" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pick_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "record_videos" (
	"record_key" text NOT NULL,
	"video_id" text NOT NULL,
	"release_id" bigint NOT NULL,
	"track_position" text,
	"track_title" text,
	"title" text NOT NULL,
	"artist_display" text NOT NULL,
	"artist_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"label_id" bigint,
	"label_name" text,
	"catno" text,
	"year" smallint,
	"country" text,
	"genres" text[] NOT NULL,
	"styles" text[] NOT NULL,
	"format_names" text[] NOT NULL,
	"format_descriptions" text[] NOT NULL,
	"pressings" integer NOT NULL,
	"deep_cut" real,
	"bpm" real,
	"camelot_key" text,
	"tempo_source" text,
	"rand_key" integer NOT NULL,
	"playable" boolean DEFAULT false NOT NULL,
	"added_in_dump" date NOT NULL,
	CONSTRAINT "record_videos_pkey" PRIMARY KEY("record_key","video_id")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" bigint PRIMARY KEY NOT NULL,
	"master_id" bigint,
	"record_key" text NOT NULL,
	"is_main_release" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"artists" jsonb NOT NULL,
	"artist_display" text NOT NULL,
	"labels" jsonb NOT NULL,
	"year" smallint,
	"country" text,
	"genres" text[] NOT NULL,
	"styles" text[] NOT NULL,
	"formats" jsonb NOT NULL,
	"tracklist" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_census" (
	"dump_date" date PRIMARY KEY NOT NULL,
	"census" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"source" text,
	"expires_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tempo_votes" (
	"user_id" uuid NOT NULL,
	"release_id" bigint NOT NULL,
	"track_position" text NOT NULL,
	"bpm" real,
	"camelot_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tempo_votes_user_id_release_id_track_position_pk" PRIMARY KEY("user_id","release_id","track_position")
);
--> statement-breakpoint
CREATE TABLE "track_audio_features" (
	"release_id" bigint NOT NULL,
	"track_position" text NOT NULL,
	"source" text NOT NULL,
	"bpm" real,
	"camelot_key" text,
	"confidence" real,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "track_audio_features_release_id_track_position_source_pk" PRIMARY KEY("release_id","track_position","source")
);
--> statement-breakpoint
CREATE TABLE "video_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" text NOT NULL,
	"code" integer NOT NULL,
	"user_id" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "yt_quota_usage" (
	"pacific_day" date PRIMARY KEY NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"exhausted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yt_videos" (
	"video_id" text PRIMARY KEY NOT NULL,
	"dump_embed_flag" boolean NOT NULL,
	"status" text DEFAULT 'unchecked' NOT NULL,
	"title" text,
	"duration_s" integer,
	"view_count" bigint,
	"thumbnail_url" text,
	"region_allowed" text[],
	"region_blocked" text[],
	"checked_at" timestamp with time zone,
	"error_reports" integer DEFAULT 0 NOT NULL,
	"first_seen_dump" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crate_items" ADD CONSTRAINT "crate_items_crate_id_crates_id_fk" FOREIGN KEY ("crate_id") REFERENCES "public"."crates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changelog_published" ON "changelog_entries" USING btree ("published_at") WHERE not draft;--> statement-breakpoint
CREATE INDEX "crate_items_order" ON "crate_items" USING btree ("crate_id","position");--> statement-breakpoint
CREATE INDEX "crates_user" ON "crates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "history_user_video" ON "history" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "link_suggestions_pending" ON "link_suggestions" USING btree ("created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "link_suggestions_accepted" ON "link_suggestions" USING btree ("record_key") WHERE status = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX "link_suggestions_unique" ON "link_suggestions" USING btree ("user_id","record_key","video_id");--> statement-breakpoint
CREATE INDEX "notes_user_video" ON "notes" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "pick_cache_expiry" ON "pick_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "record_videos_shuffle" ON "record_videos" USING btree ("rand_key") WHERE playable;--> statement-breakpoint
CREATE INDEX "record_videos_styles" ON "record_videos" USING gin ("styles");--> statement-breakpoint
CREATE INDEX "record_videos_genres" ON "record_videos" USING gin ("genres");--> statement-breakpoint
CREATE INDEX "record_videos_artists" ON "record_videos" USING gin ("artist_ids");--> statement-breakpoint
CREATE INDEX "record_videos_year" ON "record_videos" USING btree ("year");--> statement-breakpoint
CREATE INDEX "record_videos_country" ON "record_videos" USING btree ("country");--> statement-breakpoint
CREATE INDEX "record_videos_label" ON "record_videos" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "record_videos_bpm" ON "record_videos" USING btree ("bpm") WHERE bpm is not null;--> statement-breakpoint
CREATE INDEX "record_videos_video" ON "record_videos" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "releases_record_key" ON "releases" USING btree ("record_key");--> statement-breakpoint
CREATE INDEX "tempo_votes_track" ON "tempo_votes" USING btree ("release_id","track_position");--> statement-breakpoint
CREATE INDEX "video_reports_unprocessed" ON "video_reports" USING btree ("reported_at") WHERE processed_at is null;--> statement-breakpoint
CREATE INDEX "video_reports_user" ON "video_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "yt_videos_due" ON "yt_videos" USING btree ("checked_at" NULLS FIRST);