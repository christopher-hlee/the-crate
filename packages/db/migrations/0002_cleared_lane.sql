CREATE TABLE "asset_chops" (
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"markers" real[] DEFAULT '{}'::real[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_chops_user_id_asset_id_pk" PRIMARY KEY("user_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "asset_rights" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"basis" text NOT NULL,
	"source_url" text NOT NULL,
	"license_url" text,
	"recording_year" smallint,
	"date_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attribution" text,
	"license_ref" text,
	"license_expires_at" date,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rules_cutoff_year" smallint,
	"problems" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"year" smallint,
	"label" text,
	"catno" text,
	"styles" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"duration_s" real,
	"sample_rate" integer,
	"channels" smallint,
	"bpm" real,
	"camelot_key" text,
	"wav_key" text,
	"preview_key" text,
	"preview_type" text,
	"peaks_key" text,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crate_assets" (
	"crate_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crate_assets_crate_id_asset_id_pk" PRIMARY KEY("crate_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "rights_rules" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"us_pd_cutoff_year" smallint,
	"auto_advance" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_chops" ADD CONSTRAINT "asset_chops_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_rights" ADD CONSTRAINT "asset_rights_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crate_assets" ADD CONSTRAINT "crate_assets_crate_id_crates_id_fk" FOREIGN KEY ("crate_id") REFERENCES "public"."crates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crate_assets" ADD CONSTRAINT "crate_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_status" ON "assets" USING btree ("status","artist");--> statement-breakpoint
CREATE INDEX "crate_assets_order" ON "crate_assets" USING btree ("crate_id","position");--> statement-breakpoint
-- The single rules row. pd_rollover (or the first cleared import) sets the cutoff year.
INSERT INTO "rights_rules" ("id") VALUES (1) ON CONFLICT DO NOTHING;
