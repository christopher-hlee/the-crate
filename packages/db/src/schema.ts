// Drizzle schema for every table in docs/SPEC.md "Data model", plus the bookkeeping
// tables recorded in docs/DECISIONS.md. Three groups:
//   catalog       rebuilt monthly into stg_* tables and swapped in (worker writes)
//   YouTube state persists across rebuilds, refreshed or nulled within 30 days (worker writes)
//   user data     keys only, no foreign keys into the catalog (web writes)

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id64 = (name: string) => bigint(name, { mode: "number" });

export type ArtistJson = { id: number | null; name: string; anv: string; join: string };
export type LabelJson = { id: number | null; name: string; catno: string };
export type FormatJson = { name: string; qty: string; text: string; descriptions: string[] };
export type TrackJson = {
  position: string;
  title: string;
  duration_s: number | null;
  artists: ArtistJson[];
};

// ---------------------------------------------------------------------------------------
// Catalog

/** One row per Discogs release that has at least one YouTube link. */
export const releases = pgTable(
  "releases",
  {
    id: id64("id").primaryKey(),
    masterId: id64("master_id"),
    recordKey: text("record_key").notNull(),
    isMainRelease: boolean("is_main_release").notNull().default(false),
    title: text("title").notNull(),
    artists: jsonb("artists").$type<ArtistJson[]>().notNull(),
    artistDisplay: text("artist_display").notNull(),
    labels: jsonb("labels").$type<LabelJson[]>().notNull(),
    year: smallint("year"),
    country: text("country"),
    genres: text("genres").array().notNull(),
    styles: text("styles").array().notNull(),
    formats: jsonb("formats").$type<FormatJson[]>().notNull(),
    tracklist: jsonb("tracklist").$type<TrackJson[]>().notNull(),
  },
  (t) => [index("releases_record_key").on(t.recordKey)],
);

/** The shuffle unit: one row per (record, YouTube video). */
export const recordVideos = pgTable(
  "record_videos",
  {
    recordKey: text("record_key").notNull(),
    videoId: text("video_id").notNull(),
    releaseId: id64("release_id").notNull(),
    trackPosition: text("track_position"),
    trackTitle: text("track_title"),
    title: text("title").notNull(),
    artistDisplay: text("artist_display").notNull(),
    /** Discogs artist IDs credited on the release, for the Pro artist scope. */
    artistIds: id64("artist_ids").array().notNull().default(sql`'{}'::bigint[]`),
    labelId: id64("label_id"),
    labelName: text("label_name"),
    catno: text("catno"),
    year: smallint("year"),
    country: text("country"),
    genres: text("genres").array().notNull(),
    styles: text("styles").array().notNull(),
    formatNames: text("format_names").array().notNull(),
    formatDescriptions: text("format_descriptions").array().notNull(),
    pressings: integer("pressings").notNull(),
    deepCut: real("deep_cut"),
    bpm: real("bpm"),
    camelotKey: text("camelot_key"),
    /** Which track_audio_features source supplied bpm and camelot_key. */
    tempoSource: text("tempo_source"),
    randKey: integer("rand_key").notNull(),
    playable: boolean("playable").notNull().default(false),
    addedInDump: date("added_in_dump", { mode: "string" }).notNull(),
  },
  (t) => [
    primaryKey({ name: "record_videos_pkey", columns: [t.recordKey, t.videoId] }),
    index("record_videos_shuffle").on(t.randKey).where(sql`playable`),
    index("record_videos_styles").using("gin", t.styles),
    index("record_videos_genres").using("gin", t.genres),
    index("record_videos_artists").using("gin", t.artistIds),
    index("record_videos_year").on(t.year),
    index("record_videos_country").on(t.country),
    index("record_videos_label").on(t.labelId),
    index("record_videos_bpm").on(t.bpm).where(sql`bpm is not null`),
    index("record_videos_video").on(t.videoId),
  ],
);

// ---------------------------------------------------------------------------------------
// YouTube state

export const YT_STATUSES = [
  "unchecked",
  "playable",
  "not_embeddable",
  "unavailable",
  "made_for_kids",
] as const;
export type YtStatus = (typeof YT_STATUSES)[number];

export const ytVideos = pgTable(
  "yt_videos",
  {
    videoId: text("video_id").primaryKey(),
    dumpEmbedFlag: boolean("dump_embed_flag").notNull(),
    status: text("status").$type<YtStatus>().notNull().default("unchecked"),
    // Everything below is YouTube API data: refresh within 30 days or null it (rule 7).
    title: text("title"),
    durationS: integer("duration_s"),
    viewCount: id64("view_count"),
    thumbnailUrl: text("thumbnail_url"),
    regionAllowed: text("region_allowed").array(),
    regionBlocked: text("region_blocked").array(),
    channelId: text("channel_id"),
    channelTitle: text("channel_title"),
    tags: text("tags").array(),
    checkedAt: tstz("checked_at"),
    errorReports: integer("error_reports").notNull().default(0),
    firstSeenDump: date("first_seen_dump", { mode: "string" }).notNull(),
  },
  (t) => [
    index("yt_videos_due").on(t.checkedAt.asc().nullsFirst()),
    index("yt_videos_channel").on(t.channelId),
  ],
);

/** Units spent per Pacific-time day, shared by every job that calls the Data API. */
export const ytQuotaUsage = pgTable("yt_quota_usage", {
  pacificDay: date("pacific_day", { mode: "string" }).primaryKey(),
  units: integer("units").notNull().default(0),
  exhausted: boolean("exhausted").notNull().default(false),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

/** Tempo and key candidates per track from every source; survives rebuilds. */
export const trackAudioFeatures = pgTable(
  "track_audio_features",
  {
    releaseId: id64("release_id").notNull(),
    trackPosition: text("track_position").notNull(),
    source: text("source")
      .$type<"getsongbpm" | "acousticbrainz" | "analysis" | "community">()
      .notNull(),
    bpm: real("bpm"),
    camelotKey: text("camelot_key"),
    confidence: real("confidence"),
    updatedAt: tstz("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.releaseId, t.trackPosition, t.source] })],
);

// ---------------------------------------------------------------------------------------
// Pipeline bookkeeping

export const ingestRuns = pgTable("ingest_runs", {
  dumpDate: date("dump_date", { mode: "string" }).primaryKey(),
  status: text("status").$type<"running" | "succeeded" | "failed" | "rolled_back">().notNull(),
  sha256: text("sha256"),
  releasesSeen: integer("releases_seen"),
  records: integer("records"),
  recordVideos: integer("record_videos"),
  addedRecords: integer("added_records"),
  removedRecords: integer("removed_records"),
  newVideoIds: integer("new_video_ids"),
  error: text("error"),
  startedAt: tstz("started_at").notNull(),
  finishedAt: tstz("finished_at"),
});

export type StyleCensusEntry = {
  genre: string | null;
  records: number;
  byYear: Record<string, number>;
  cooccurring: [string, number][];
};
export type Census = {
  /** "playable" once validation has run; "all" before any video has been checked. */
  basis: "playable" | "all";
  totalRecords: number;
  styles: Record<string, StyleCensusEntry>;
  genres: Record<string, number>;
  countries: Record<string, number>;
  formats: Record<string, number>;
  years: Record<string, number>;
  refreshedAt: string;
};

export const styleCensus = pgTable("style_census", {
  dumpDate: date("dump_date", { mode: "string" }).primaryKey(),
  census: jsonb("census").$type<Census>().notNull(),
});

export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<"data" | "app">().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    draft: boolean("draft").notNull().default(true),
    publishedAt: tstz("published_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("changelog_published").on(t.publishedAt).where(sql`not draft`)],
);

// ---------------------------------------------------------------------------------------
// User data: keys only, no foreign keys into catalog tables.

export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id").primaryKey(),
  plan: text("plan").$type<"free" | "pro">().notNull().default("free"),
  source: text("source").$type<"stripe" | "app_store" | "play_store">(),
  expiresAt: tstz("expires_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const history = pgTable(
  "history",
  {
    userId: uuid("user_id").notNull(),
    playedAt: tstz("played_at").notNull(),
    recordKey: text("record_key").notNull(),
    videoId: text("video_id").notNull(),
    seconds: real("seconds"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.playedAt] }),
    index("history_user_video").on(t.userId, t.videoId),
  ],
);

export const crates = pgTable(
  "crates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>(),
    seed: id64("seed"),
    shareId: text("share_id").unique(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("crates_user").on(t.userId)],
);

export const crateItems = pgTable(
  "crate_items",
  {
    crateId: uuid("crate_id")
      .notNull()
      .references(() => crates.id, { onDelete: "cascade" }),
    recordKey: text("record_key").notNull(),
    videoId: text("video_id").notNull(),
    position: integer("position").notNull(),
    /** A short note on this record in this crate. */
    note: text("note"),
    addedAt: tstz("added_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.crateId, t.recordKey, t.videoId] }),
    index("crate_items_order").on(t.crateId, t.position),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    recordKey: text("record_key").notNull(),
    videoId: text("video_id").notNull(),
    atSeconds: integer("at_seconds"),
    body: text("body").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("notes_user_video").on(t.userId, t.videoId)],
);

export const tempoVotes = pgTable(
  "tempo_votes",
  {
    userId: uuid("user_id").notNull(),
    releaseId: id64("release_id").notNull(),
    trackPosition: text("track_position").notNull(),
    bpm: real("bpm"),
    camelotKey: text("camelot_key"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.releaseId, t.trackPosition] }),
    index("tempo_votes_track").on(t.releaseId, t.trackPosition),
  ],
);

export const linkSuggestions = pgTable(
  "link_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    recordKey: text("record_key").notNull(),
    videoId: text("video_id").notNull(),
    status: text("status")
      .$type<"pending" | "accepted" | "rejected">()
      .notNull()
      .default("pending"),
    reason: text("reason"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    checkedAt: tstz("checked_at"),
  },
  (t) => [
    index("link_suggestions_pending").on(t.createdAt).where(sql`status = 'pending'`),
    index("link_suggestions_accepted").on(t.recordKey).where(sql`status = 'accepted'`),
    uniqueIndex("link_suggestions_unique").on(t.userId, t.recordKey, t.videoId),
  ],
);

/** Player error reports. The web app writes these; the worker turns them into rechecks. */
export const videoReports = pgTable(
  "video_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: text("video_id").notNull(),
    code: integer("code").notNull(),
    userId: uuid("user_id"),
    reportedAt: tstz("reported_at").notNull().defaultNow(),
    processedAt: tstz("processed_at"),
  },
  (t) => [
    index("video_reports_unprocessed").on(t.reportedAt).where(sql`processed_at is null`),
    index("video_reports_user").on(t.userId),
  ],
);

/** Account deletions whose external steps (Supabase auth, billing) still need a retry. */
export const accountDeletions = pgTable("account_deletions", {
  userId: uuid("user_id").primaryKey(),
  requestedAt: tstz("requested_at").notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});

// ---------------------------------------------------------------------------------------
// Shared server state without Redis

/** Fixed-window counters per IP or user. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: tstz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** Narrow-filter ID lists and seeded orders, cached with an expiry. */
export const pickCache = pgTable(
  "pick_cache",
  {
    key: text("key").primaryKey(),
    payload: jsonb("payload").notNull(),
    expiresAt: tstz("expires_at").notNull(),
  },
  (t) => [index("pick_cache_expiry").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------------------
// Cleared lane (Phase 4, behind FEATURE_CLEARED_LANE): audio we host ourselves, each asset
// with a rights record (rule 20). The worker writes assets and rights; the web app writes
// the user tables (asset_chops, crate_assets).

export type AssetStatus = "pending" | "processing" | "ready" | "held" | "rejected" | "withdrawn";

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable key from the import manifest, so re-imports update rather than duplicate. */
    slug: text("slug").notNull().unique(),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
    year: smallint("year"),
    label: text("label"),
    catno: text("catno"),
    styles: text("styles").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").$type<AssetStatus>().notNull().default("pending"),
    /** Why the asset isn't ready (rights problems, a failed transcode). */
    statusReason: text("status_reason"),
    durationS: real("duration_s"),
    sampleRate: integer("sample_rate"),
    channels: smallint("channels"),
    bpm: real("bpm"),
    camelotKey: text("camelot_key"),
    /** Object keys in the asset store (R2): the WAV master, the streaming preview, peaks JSON. */
    wavKey: text("wav_key"),
    previewKey: text("preview_key"),
    previewType: text("preview_type"),
    peaksKey: text("peaks_key"),
    sha256: text("sha256"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("assets_status").on(t.status, t.artist)],
);

export const assetRights = pgTable("asset_rights", {
  assetId: uuid("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  basis: text("basis").$type<"us_pd" | "cc0" | "cc_by" | "cc_by_sa" | "signed_license">().notNull(),
  sourceUrl: text("source_url").notNull(),
  licenseUrl: text("license_url"),
  recordingYear: smallint("recording_year"),
  dateEvidence: jsonb("date_evidence")
    .$type<{ kind: string; citation: string; url: string | null }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  attribution: text("attribution"),
  licenseRef: text("license_ref"),
  licenseExpiresAt: date("license_expires_at", { mode: "string" }),
  /** When the rules last passed (or failed) this record, and the PD cutoff they used. */
  checkedAt: tstz("checked_at").notNull().defaultNow(),
  rulesCutoffYear: smallint("rules_cutoff_year"),
  problems: text("problems").array().notNull().default(sql`'{}'::text[]`),
});

/** One row: the US public-domain cutoff year in force, advanced by pd_rollover each January. */
export const rightsRules = pgTable("rights_rules", {
  id: smallint("id").primaryKey().default(1),
  usPdCutoffYear: smallint("us_pd_cutoff_year"),
  /** Off when the year is held back by hand (e.g. on legal advice); pd_rollover then leaves it. */
  autoAdvance: boolean("auto_advance").notNull().default(true),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const assetChops = pgTable(
  "asset_chops",
  {
    userId: uuid("user_id").notNull(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    markers: real("markers").array().notNull().default(sql`'{}'::real[]`),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.assetId] })],
);

export const crateAssets = pgTable(
  "crate_assets",
  {
    crateId: uuid("crate_id")
      .notNull()
      .references(() => crates.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: tstz("added_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.crateId, t.assetId] }),
    index("crate_assets_order").on(t.crateId, t.position),
  ],
);

// ---------------------------------------------------------------------------------------
// Favorites, saved filters, profiles and comments (user data; keys only into the catalog)

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id").notNull(),
    recordKey: text("record_key").notNull(),
    videoId: text("video_id").notNull(),
    note: text("note"),
    addedAt: tstz("added_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.recordKey, t.videoId] }),
    index("favorites_recent").on(t.userId, t.addedAt.desc()),
  ],
);

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("saved_filters_name").on(t.userId, t.name)],
);

/** Public display names, shown on comments. */
export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id").primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  // Unique ignoring case, spaces, dots, dashes and underscores (core's displayNameKey).
  (t) => [
    uniqueIndex("profiles_display_name").on(
      sql`lower(regexp_replace(${t.displayName}, '[ ._-]', '', 'g'))`,
    ),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordKey: text("record_key").notNull(),
    userId: uuid("user_id").notNull(),
    body: text("body").notNull(),
    /**
     * Hidden once enough people report it. Both columns are worked out from the live
     * comment_reports rows, so a reporter's account deletion can bring a comment back.
     * Moderators remove a comment by deleting it (docs/RUNBOOK.md).
     */
    hidden: boolean("hidden").notNull().default(false),
    reportCount: integer("report_count").notNull().default(0),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("comments_record").on(t.recordKey, t.createdAt.desc()),
    index("comments_user").on(t.userId),
  ],
);

export const commentReports = pgTable(
  "comment_reports",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId] }),
    index("comment_reports_user").on(t.userId),
  ],
);

/**
 * Commenters a user has blocked: their comments are hidden from the blocker. `id` is the
 * opaque handle the blocker sees, so the blocked user's ID never leaves the server. Account
 * deletion removes rows on either side.
 */
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id").notNull(),
    blockedId: uuid("blocked_id").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    uniqueIndex("user_blocks_id").on(t.id),
    index("user_blocks_blocked").on(t.blockedId),
  ],
);
