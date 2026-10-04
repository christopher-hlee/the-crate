// zod contracts for every /api/v1 request and response. The server validates requests
// against these; the web and mobile clients validate responses.

import {
  DATE_EVIDENCE_KINDS,
  displayNameProblem,
  FiltersSchema,
  isRecordKey,
  isVideoId,
  MAX_CHOPS,
  PLANS,
  REPORTABLE_PLAYER_ERRORS,
  RIGHTS_BASES,
  SHUFFLE_EXCLUDE_MAX,
} from "@app/core";
import { z } from "zod";

export const RecordKeySchema = z.string().refine(isRecordKey, "Invalid record key");
export const VideoIdSchema = z.string().refine(isVideoId, "Invalid YouTube video ID");
export const UuidSchema = z.uuid();
const Iso = z.string(); // ISO 8601 timestamps

export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "pro_required",
  "not_found",
  "conflict",
  "limit_reached",
  "rate_limited",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorBodySchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

// ---------------------------------------------------------------------------- shuffle

export const TrackRefSchema = z.object({ position: z.string(), title: z.string() });
export const TempoSchema = z.object({
  bpm: z.number(),
  camelotKey: z.string().nullable(),
  source: z.string(),
});

export const ShufflePickSchema = z.object({
  recordKey: RecordKeySchema,
  videoId: VideoIdSchema,
  /** The pressing the link came from; tempo and key votes are per (release, track). */
  releaseId: z.number().int(),
  track: TrackRefSchema.nullable(),
  record: z.object({
    title: z.string(),
    artist: z.string(),
    label: z.string().nullable(),
    catno: z.string().nullable(),
    year: z.number().int().nullable(),
    country: z.string().nullable(),
    styles: z.array(z.string()),
    discogsUrl: z.string(),
  }),
  tempo: TempoSchema.nullable(),
  /** YouTube's thumbnail (≥120×70), refreshed within 30 days; null when unknown. */
  thumbnailUrl: z.string().nullable(),
  /** The uploading channel (YouTube data, refreshed within 30 days), for "more from this channel". */
  channel: z.object({ id: z.string(), title: z.string(), topic: z.boolean() }).nullable(),
  /** Whether the signed-in viewer has this record and video in their favorites. */
  favorited: z.boolean(),
});
export type ShufflePick = z.infer<typeof ShufflePickSchema>;

export const ShuffleResponseSchema = z.object({
  pick: ShufflePickSchema.nullable(),
  /** How the pick was made: an index seek, or a cached list for narrow filters. */
  via: z.enum(["seek", "list"]),
});
export type ShuffleResponse = z.infer<typeof ShuffleResponseSchema>;

/** Exclusions sent with a shuffle as repeated query params. */
export const ShuffleExclusionsSchema = z.object({
  session: z.array(RecordKeySchema).max(SHUFFLE_EXCLUDE_MAX).default([]),
  seen: z.array(VideoIdSchema).max(SHUFFLE_EXCLUDE_MAX).default([]),
});

// ---------------------------------------------------------------------------- records

export const RecordVideoSchema = z.object({
  videoId: VideoIdSchema,
  track: TrackRefSchema.nullable(),
  tempo: TempoSchema.nullable(),
});

export const RecordSchema = z.object({
  recordKey: RecordKeySchema,
  discogsUrl: z.string(),
  title: z.string(),
  artist: z.string(),
  artists: z.array(z.object({ id: z.number().nullable(), name: z.string() })),
  labels: z.array(z.object({ id: z.number().nullable(), name: z.string(), catno: z.string() })),
  year: z.number().int().nullable(),
  country: z.string().nullable(),
  genres: z.array(z.string()),
  styles: z.array(z.string()),
  formats: z.array(z.object({ name: z.string(), descriptions: z.array(z.string()) })),
  pressings: z.number().int(),
  tracklist: z.array(
    z.object({ position: z.string(), title: z.string(), durationS: z.number().int().nullable() }),
  ),
  /** The record's playable videos. */
  videos: z.array(RecordVideoSchema),
});
export type RecordDetail = z.infer<typeof RecordSchema>;

/** What a crate, history or share row shows for a record; null fields when it left the catalog. */
export const RecordSummarySchema = z.object({
  title: z.string(),
  artist: z.string(),
  label: z.string().nullable(),
  catno: z.string().nullable(),
  year: z.number().int().nullable(),
  country: z.string().nullable(),
  styles: z.array(z.string()),
  track: TrackRefSchema.nullable(),
  tempo: TempoSchema.nullable(),
});
export type RecordSummary = z.infer<typeof RecordSummarySchema>;

export const ItemRefSchema = z.object({ recordKey: RecordKeySchema, videoId: VideoIdSchema });

export const CatalogItemSchema = ItemRefSchema.extend({
  discogsUrl: z.string(),
  /** false when the record or video has left the catalog or can't play right now. */
  available: z.boolean(),
  record: RecordSummarySchema.nullable(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

// ---------------------------------------------------------------------------- styles

export const StylesResponseSchema = z.object({
  dumpDate: z.string().nullable(),
  basis: z.enum(["playable", "all"]),
  totalRecords: z.number().int(),
  styles: z.array(
    z.object({
      name: z.string(),
      genre: z.string().nullable(),
      records: z.number().int(),
      byYear: z.record(z.string(), z.number().int()),
      often: z.array(z.string()),
    }),
  ),
  genres: z.array(z.object({ name: z.string(), records: z.number().int() })),
  countries: z.array(z.object({ name: z.string(), records: z.number().int() })),
  formats: z.array(z.object({ name: z.string(), records: z.number().int() })),
  years: z.record(z.string(), z.number().int()),
});
export type StylesResponse = z.infer<typeof StylesResponseSchema>;

export const CountResponseSchema = z.object({
  count: z.number().int(),
  capped: z.boolean(),
  /** "10,000+" when capped. */
  display: z.string(),
  /** Share of matches with a tempo, 0..1; null when nothing matched. */
  tempoCoverage: z.number().nullable(),
});
export type CountResponse = z.infer<typeof CountResponseSchema>;

// ---------------------------------------------------------------------------- plays and history

export const PlayRequestSchema = z.object({
  recordKey: RecordKeySchema,
  videoId: VideoIdSchema,
  seconds: z.number().min(0).max(86_400).optional(),
});
export const PlayResponseSchema = z.object({ logged: z.boolean() });

export const HistoryResponseSchema = z.object({
  items: z.array(CatalogItemSchema.extend({ playedAt: Iso, seconds: z.number().nullable() })),
  nextCursor: z.string().nullable(),
  window: z.number().int(),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

// ---------------------------------------------------------------------------- crates

export const CrateNameSchema = z.string().trim().min(1).max(80);

export const CrateSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  filters: FiltersSchema.nullable(),
  seed: z.number().int().nullable(),
  shareId: z.string().nullable(),
  itemCount: z.number().int(),
  createdAt: Iso,
  updatedAt: Iso,
});
export type Crate = z.infer<typeof CrateSchema>;

export const LimitsSchema = z.object({
  maxCrates: z.number().int().nullable(),
  maxItemsPerCrate: z.number().int().nullable(),
  historyWindow: z.number().int(),
});

export const CratesResponseSchema = z.object({
  crates: z.array(CrateSchema),
  limits: LimitsSchema,
});

export const CreateCrateRequestSchema = z.object({
  name: CrateNameSchema,
  /** Seeded crates (filters + seed) are a Pro tool. */
  filters: FiltersSchema.optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export const UpdateCrateRequestSchema = z
  .object({
    name: CrateNameSchema.optional(),
    filters: FiltersSchema.nullable().optional(),
    seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const CrateItemSchema = CatalogItemSchema.extend({
  position: z.number().int(),
  note: z.string().nullable(),
  addedAt: Iso,
});
export type CrateItem = z.infer<typeof CrateItemSchema>;

export const CrateDetailSchema = z.object({ crate: CrateSchema, items: z.array(CrateItemSchema) });
export type CrateDetail = z.infer<typeof CrateDetailSchema>;

export const AddCrateItemRequestSchema = ItemRefSchema;
export const ReorderCrateItemsRequestSchema = z.object({
  order: z.array(ItemRefSchema).max(10_000),
});

export const SequenceResponseSchema = z.object({
  items: z.array(CatalogItemSchema),
  page: z.number().int(),
  hasMore: z.boolean(),
  seed: z.number().int(),
});
export type SequenceResponse = z.infer<typeof SequenceResponseSchema>;

export const DailyResponseSchema = SequenceResponseSchema.extend({
  date: z.string(),
  preset: z.object({ name: z.string(), blurb: z.string() }),
});
export type DailyResponse = z.infer<typeof DailyResponseSchema>;

export const ShareResponseSchema = z.object({ shareId: z.string(), url: z.string() });

export const SharedCrateSchema = z.object({
  crate: z.object({
    name: z.string(),
    shareId: z.string(),
    filters: FiltersSchema.nullable(),
    seed: z.number().int().nullable(),
    itemCount: z.number().int(),
  }),
  items: z.array(CrateItemSchema),
});
export type SharedCrate = z.infer<typeof SharedCrateSchema>;

// ---------------------------------------------------------------------------- notes, votes, reports, links

export const NoteSchema = z.object({
  id: UuidSchema,
  recordKey: RecordKeySchema,
  videoId: VideoIdSchema,
  atSeconds: z.number().int().nullable(),
  body: z.string(),
  createdAt: Iso,
});
export type Note = z.infer<typeof NoteSchema>;
export const NotesResponseSchema = z.object({ notes: z.array(NoteSchema) });
export const CreateNoteRequestSchema = z.object({
  recordKey: RecordKeySchema,
  videoId: VideoIdSchema,
  atSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
  body: z.string().trim().min(1).max(2000),
});

export const TempoVoteRequestSchema = z
  .object({
    releaseId: z.number().int().positive(),
    trackPosition: z.string().trim().min(1).max(20),
    bpm: z.number().min(20).max(400).optional(),
    camelotKey: z
      .string()
      .regex(/^(1[0-2]|[1-9])[AB]$/)
      .optional(),
  })
  .refine(
    (v) => v.bpm !== undefined || v.camelotKey !== undefined,
    "Vote for a tempo, a key or both",
  );

export const ReportRequestSchema = z.object({
  code: z
    .number()
    .int()
    .refine((c) => (REPORTABLE_PLAYER_ERRORS as readonly number[]).includes(c)),
});

export const LinkSuggestionRequestSchema = z.object({ url: z.string().trim().min(1).max(500) });
export const LinkSuggestionResponseSchema = z.object({
  id: UuidSchema,
  videoId: VideoIdSchema,
  status: z.enum(["pending", "accepted", "rejected"]),
});

// ---------------------------------------------------------------------------- changelog and account

export const ChangelogResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: UuidSchema,
      kind: z.enum(["data", "app"]),
      title: z.string(),
      body: z.string(),
      publishedAt: Iso,
    }),
  ),
});
export type ChangelogResponse = z.infer<typeof ChangelogResponseSchema>;

export const MeResponseSchema = z.object({
  user: z.object({ id: UuidSchema, email: z.string().nullable() }),
  plan: z.enum(PLANS),
  planSource: z.enum(["stripe", "app_store", "play_store"]).nullable(),
  expiresAt: Iso.nullable(),
  limits: LimitsSchema.extend({
    maxFavorites: z.number().int(),
    maxSavedFilters: z.number().int(),
    notes: z.boolean(),
    crateExport: z.boolean(),
    createShared: z.boolean(),
    proFilters: z.boolean(),
    tempoVotes: z.boolean(),
    youtubePlaylist: z.boolean(),
    comments: z.boolean(),
  }),
  profile: z.object({ displayName: z.string() }).nullable(),
  rank: z.object({ level: z.number().int(), title: z.string(), points: z.number().int() }),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const DeletedResponseSchema = z.object({ deleted: z.literal(true) });
export const OkResponseSchema = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------- billing (Phase 2)

export const CheckoutRequestSchema = z.object({
  interval: z.enum(["month", "year"]).default("month"),
});
export const RedirectResponseSchema = z.object({ url: z.string() });

// ---------------------------------------------------------------------------- archive (Phase 4, flagged)
// Public-domain and Creative Commons recordings we host ourselves (the "cleared lane" in the
// spec; the product never calls it "cleared" until the rights rules pass legal review).

export const AssetRightsSchema = z.object({
  basis: z.enum(RIGHTS_BASES),
  basisLabel: z.string(),
  sourceUrl: z.string(),
  licenseUrl: z.string().nullable(),
  recordingYear: z.number().int().nullable(),
  dateEvidence: z.array(
    z.object({
      kind: z.enum(DATE_EVIDENCE_KINDS),
      citation: z.string(),
      url: z.string().nullable(),
    }),
  ),
  attribution: z.string().nullable(),
  checkedAt: Iso,
});

export const AssetSchema = z.object({
  id: UuidSchema,
  artist: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  label: z.string().nullable(),
  catno: z.string().nullable(),
  styles: z.array(z.string()),
  durationS: z.number().nullable(),
  bpm: z.number().nullable(),
  camelotKey: z.string().nullable(),
  /** Streaming preview and waveform peaks: short-lived URLs, fetch them soon. */
  previewUrl: z.string(),
  previewType: z.string(),
  peaksUrl: z.string(),
  rights: AssetRightsSchema,
});
export type Asset = z.infer<typeof AssetSchema>;

export const AssetListResponseSchema = z.object({
  assets: z.array(AssetSchema),
  nextCursor: z.string().nullable(),
});

export const ChopsSchema = z.object({
  markers: z.array(z.number().min(0).max(86_400)).max(MAX_CHOPS),
});

export const SidecarSchema = z.object({
  file: z.string(),
  artist: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  bpm: z.number().nullable(),
  camelotKey: z.string().nullable(),
  chop: z
    .object({ index: z.number().int(), startSeconds: z.number(), endSeconds: z.number() })
    .nullable(),
  rights: z.record(z.string(), z.unknown()),
  exportedBy: z.string(),
  exportedAt: Iso,
});

/** Pro: the WAV master (short-lived URL), its DAW file name, and the rights sidecar. */
export const AssetDownloadResponseSchema = z.object({
  wavUrl: z.string(),
  fileStem: z.string(),
  sidecar: SidecarSchema,
});
export type AssetDownload = z.infer<typeof AssetDownloadResponseSchema>;

export const CrateAssetsResponseSchema = z.object({
  assets: z.array(AssetSchema.extend({ position: z.number().int(), addedAt: Iso })),
});
export const CrateAssetRequestSchema = z.object({ assetId: UuidSchema });

// ---------------------------------------------------------------------------- favorites

export const FavoriteItemSchema = CatalogItemSchema.extend({
  note: z.string().nullable(),
  addedAt: Iso,
});
export type FavoriteItem = z.infer<typeof FavoriteItemSchema>;

export const FavoritesResponseSchema = z.object({
  items: z.array(FavoriteItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  max: z.number().int(),
});
export type FavoritesResponse = z.infer<typeof FavoritesResponseSchema>;

export const FavoriteStatusSchema = z.object({ favorited: z.boolean(), total: z.number().int() });

export const NoteTextSchema = z.string().trim().max(1000).nullable();
export const ItemNoteRequestSchema = ItemRefSchema.extend({ note: NoteTextSchema });

// ---------------------------------------------------------------------------- saved filters

export const SavedFilterSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  filters: FiltersSchema,
  createdAt: Iso,
});
export type SavedFilter = z.infer<typeof SavedFilterSchema>;
export const SavedFiltersResponseSchema = z.object({
  items: z.array(SavedFilterSchema),
  max: z.number().int(),
});
export const SaveFilterRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: FiltersSchema,
});

// ---------------------------------------------------------------------------- profiles and comments

export const ProfileRequestSchema = z.object({
  displayName: z
    .string()
    .trim()
    .refine((v) => displayNameProblem(v) === null, { message: "Choose a different display name" }),
});
export const ProfileResponseSchema = z.object({ displayName: z.string() });

export const CommentSchema = z.object({
  id: UuidSchema,
  body: z.string(),
  createdAt: Iso,
  author: z.object({
    displayName: z.string(),
    rank: z.object({ level: z.number().int(), title: z.string() }),
    pro: z.boolean(),
  }),
  mine: z.boolean(),
});
export type Comment = z.infer<typeof CommentSchema>;
export const CommentsResponseSchema = z.object({ comments: z.array(CommentSchema) });
export const CreateCommentRequestSchema = z.object({ body: z.string().trim().min(1).max(1000) });

// ---------------------------------------------------------------------------- for you

export const ForYouResponseSchema = SequenceResponseSchema.extend({
  /** The styles the picks are drawn from; empty when there is nothing to go on yet. */
  basis: z.array(z.string()),
});
export type ForYouResponse = z.infer<typeof ForYouResponseSchema>;
