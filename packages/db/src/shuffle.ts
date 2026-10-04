// Shuffle SQL built from the typed filter object. User input only ever goes in as
// parameters; column names and operators come from this file.

import {
  bpmRanges,
  compatibleKeys,
  type Filters,
  keywordTsQuery,
  MATCH_COUNT_CAP,
  normalizeFilters,
  SEEDED_PAGE_SIZE,
} from "@app/core";
import { Params, type Query } from "./sql";

/** WHERE clauses for a filter set, against `record_videos` aliased as `rv`. */
export function filterClauses(input: Filters, p: Params): string[] {
  const f = normalizeFilters(input);
  const out: string[] = [];
  if (f.genres) out.push(`rv.genres && ${p.add(f.genres, "text[]")}`);
  if (f.styles) out.push(`rv.styles && ${p.add(f.styles, "text[]")}`);
  if (f.yearFrom !== undefined) out.push(`rv.year >= ${p.add(f.yearFrom, "int")}`);
  if (f.yearTo !== undefined) out.push(`rv.year <= ${p.add(f.yearTo, "int")}`);
  if (f.countries) out.push(`rv.country = any(${p.add(f.countries, "text[]")})`);
  if (f.formats) out.push(`rv.format_names && ${p.add(f.formats, "text[]")}`);
  // Pro
  if (f.formatDescriptions) {
    out.push(`rv.format_descriptions && ${p.add(f.formatDescriptions, "text[]")}`);
  }
  if (f.bpmFrom !== undefined || f.bpmTo !== undefined) {
    const ranges = bpmRanges(f.bpmFrom ?? 20, f.bpmTo ?? 400, f.halfDouble === true);
    const parts = ranges.map(
      ([lo, hi]) => `rv.bpm between ${p.add(lo, "real")} and ${p.add(hi, "real")}`,
    );
    out.push(parts.length === 1 ? (parts[0] as string) : `(${parts.join(" or ")})`);
  }
  if (f.key) {
    const keys = f.compatibleKeys ? compatibleKeys(f.key) : [f.key];
    out.push(`rv.camelot_key = any(${p.add(keys, "text[]")})`);
  }
  if (f.deepCutMin !== undefined) out.push(`rv.deep_cut >= ${p.add(f.deepCutMin, "real")}`);
  if (f.labelIds) out.push(`rv.label_id = any(${p.add(f.labelIds, "bigint[]")})`);
  if (f.artistIds) out.push(`rv.artist_ids && ${p.add(f.artistIds, "bigint[]")}`);
  if (f.recordKeys) out.push(`rv.record_key = any(${p.add(f.recordKeys, "text[]")})`);
  const ts = keywordTsQuery(f.q);
  if (ts) {
    // Discogs names (catalog) or the video's own title and tags (YouTube data, kept 30 days).
    // The expressions match the GIN indexes in migration 0003 exactly.
    const q = p.add(ts, "text");
    out.push(
      `(record_search_doc(rv.title, rv.artist_display, rv.label_name, rv.track_title, rv.styles, rv.genres) @@ to_tsquery('simple', ${q})
    or exists (select 1 from yt_videos yk where yk.video_id = rv.video_id and yk.title is not null
                 and video_search_doc(yk.title, yk.tags) @@ to_tsquery('simple', ${q})))`,
    );
  }
  if (f.topicOnly) {
    out.push(
      `exists (select 1 from yt_videos yt where yt.video_id = rv.video_id and yt.channel_title like '% - Topic')`,
    );
  }
  if (f.channelIds) {
    out.push(
      `exists (select 1 from yt_videos yc where yc.video_id = rv.video_id and yc.channel_id = any(${p.add(f.channelIds, "text[]")}))`,
    );
  }
  if (f.maxViews !== undefined) {
    // YouTube's own count, used as a filter only; it never feeds a score (rule 7).
    out.push(
      `exists (select 1 from yt_videos yv where yv.video_id = rv.video_id and yv.view_count <= ${p.add(f.maxViews, "bigint")})`,
    );
  }
  return out;
}

/** Excludes videos blocked in the viewer's country. Skipped when the country is unknown. */
export function regionClause(country: string | null | undefined, p: Params): string | null {
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  const c = p.add(country, "text");
  return `not exists (select 1 from yt_videos yr where yr.video_id = rv.video_id and (${c} = any(yr.region_blocked) or (yr.region_allowed is not null and not (${c} = any(yr.region_allowed)))))`;
}

export type Exclusions = {
  /** Records already played this session: no repeat records. */
  sessionRecordKeys?: readonly string[];
  /** Signed-out users' seen list, kept on the client. */
  clientSeenIds?: readonly string[];
  /** Signed-in users: anything in their history is skipped. */
  userId?: string | null;
  viewerCountry?: string | null;
};

function exclusionClauses(ctx: Exclusions, p: Params): string[] {
  const out: string[] = [];
  if (ctx.sessionRecordKeys && ctx.sessionRecordKeys.length > 0) {
    out.push(`rv.record_key <> all(${p.add([...ctx.sessionRecordKeys], "text[]")})`);
  }
  if (ctx.clientSeenIds && ctx.clientSeenIds.length > 0) {
    out.push(`rv.video_id <> all(${p.add([...ctx.clientSeenIds], "text[]")})`);
  }
  if (ctx.userId) {
    out.push(
      `not exists (select 1 from history h where h.user_id = ${p.add(ctx.userId, "uuid")} and h.video_id = rv.video_id)`,
    );
  }
  const region = regionClause(ctx.viewerCountry, p);
  if (region) out.push(region);
  return out;
}

function where(clauses: string[]): string {
  return clauses.join("\n  and ");
}

/** Columns a pick needs to build the ShufflePick response without another query. */
export const PICK_COLUMNS = `rv.record_key, rv.video_id, rv.release_id, rv.track_position, rv.track_title,
  rv.title, rv.artist_display, rv.label_name, rv.catno, rv.year, rv.country, rv.styles,
  rv.bpm, rv.camelot_key, rv.tempo_source`;

export type PickRow = {
  record_key: string;
  video_id: string;
  release_id: number;
  track_position: string | null;
  track_title: string | null;
  title: string;
  artist_display: string;
  label_name: string | null;
  catno: string | null;
  year: number | null;
  country: string | null;
  styles: string[];
  bpm: number | null;
  camelot_key: string | null;
  tempo_source: string | null;
};

/**
 * The unseeded pick: one indexed seek on rand_key inside the filtered set. `r` is uniform
 * in [0, 2^31); when nothing comes back, run again with r = 0 to wrap around.
 */
export function buildPickQuery(filters: Filters, ctx: Exclusions & { r: number }): Query {
  const p = new Params();
  const clauses = [
    "rv.playable",
    ...filterClauses(filters, p),
    `rv.rand_key >= ${p.add(Math.max(0, Math.floor(ctx.r)), "int")}`,
    ...exclusionClauses(ctx, p),
  ];
  return {
    text: `select ${PICK_COLUMNS}\nfrom record_videos rv\nwhere ${where(clauses)}\norder by rv.rand_key\nlimit 1`,
    values: p.values,
  };
}

/** One row by key, for picks served from a cached candidate list. */
export function buildPickByKeyQuery(recordKey: string, videoId: string): Query {
  return {
    text: `select ${PICK_COLUMNS}\nfrom record_videos rv\nwhere rv.record_key = $1 and rv.video_id = $2 and rv.playable`,
    values: [recordKey, videoId],
  };
}

/** Capped match count: stops scanning at `cap + 1` rows so "10,000+" stays cheap. */
export function buildCountQuery(
  filters: Filters,
  options: { cap?: number; viewerCountry?: string | null } = {},
): Query {
  const p = new Params();
  const clauses = ["rv.playable", ...filterClauses(filters, p)];
  const region = regionClause(options.viewerCountry, p);
  if (region) clauses.push(region);
  const cap = options.cap ?? MATCH_COUNT_CAP;
  return {
    text: `select count(*)::int as n, count(bpm)::int as with_tempo from (\n  select rv.bpm from record_videos rv\n  where ${where(clauses)}\n  limit ${p.add(cap + 1, "int")}\n) s`,
    values: p.values,
  };
}

/** Every match for a narrow filter set, to cache and pick from uniformly. */
export function buildCandidateListQuery(
  filters: Filters,
  options: { limit: number; viewerCountry?: string | null },
): Query {
  const p = new Params();
  const clauses = ["rv.playable", ...filterClauses(filters, p)];
  const region = regionClause(options.viewerCountry, p);
  if (region) clauses.push(region);
  return {
    text: `select rv.record_key, rv.video_id from record_videos rv\nwhere ${where(clauses)}\nlimit ${p.add(options.limit, "int")}`,
    values: p.values,
  };
}

/**
 * Seeded order: a seeded hash per (record, video), so different seeds give unrelated
 * orders (unlike a multiplicative rotation, where every seed shares one sequence).
 */
export function buildSeededQuery(
  filters: Filters,
  options: { seed: number; limit?: number; offset?: number },
): Query {
  const p = new Params();
  const clauses = ["rv.playable", ...filterClauses(filters, p)];
  const seed = p.add(options.seed, "bigint");
  const limit = p.add(options.limit ?? SEEDED_PAGE_SIZE, "int");
  const offset = p.add(options.offset ?? 0, "int");
  return {
    text: `select rv.record_key, rv.video_id from record_videos rv\nwhere ${where(clauses)}\norder by hashtextextended(rv.record_key || ':' || rv.video_id, ${seed}), rv.record_key, rv.video_id\nlimit ${limit} offset ${offset}`,
    values: p.values,
  };
}
