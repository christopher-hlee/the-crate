// The only YouTube Data API v3 call this app makes: videos.list, 50 IDs per request, with
// the server-side key. Only apps/worker imports this package.

import { YOUTUBE } from "@app/core";
import type { z } from "zod";
import { classifyResponse, type VideoCheck } from "./classify";
import { ApiErrorSchema, VideosListResponseSchema } from "./schema";

export const VIDEOS_LIST_URL = "https://www.googleapis.com/youtube/v3/videos";
export const VIDEOS_LIST_PARTS = "snippet,contentDetails,status,statistics";
export const VIDEOS_LIST_FIELDS =
  "items(id,snippet(title,thumbnails),contentDetails(duration,regionRestriction),status(uploadStatus,privacyStatus,embeddable,madeForKids),statistics(viewCount))";

export class QuotaExceededError extends Error {
  constructor(message = "YouTube Data API quota exceeded") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class YouTubeApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
    message: string,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type YouTubeClientOptions = {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  /** Sent as the Referer, matching the key's HTTP referrer restriction if one is set. */
  referer?: string;
};

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function buildVideosListUrl(
  ids: readonly string[],
  apiKey: string,
  baseUrl = VIDEOS_LIST_URL,
): string {
  const params = new URLSearchParams({
    part: VIDEOS_LIST_PARTS,
    id: ids.join(","),
    maxResults: String(YOUTUBE.idsPerCall),
    fields: VIDEOS_LIST_FIELDS,
    key: apiKey,
  });
  return `${baseUrl}?${params.toString()}`;
}

function errorReason(body: z.infer<typeof ApiErrorSchema> | null): string | null {
  return body?.error.errors?.[0]?.reason ?? null;
}

/** One videos.list call for up to 50 IDs. Costs 1 unit. */
export async function videosList(
  ids: readonly string[],
  options: YouTubeClientOptions,
): Promise<VideoCheck[]> {
  if (ids.length === 0) return [];
  if (ids.length > YOUTUBE.idsPerCall)
    throw new Error(`videos.list takes at most ${YOUTUBE.idsPerCall} IDs`);
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.referer) headers.referer = options.referer;
  const res = await doFetch(buildVideosListUrl(ids, options.apiKey, options.baseUrl), { headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    const reason = errorReason(parsed.success ? parsed.data : null);
    if (res.status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded")) {
      throw new QuotaExceededError();
    }
    const message = parsed.success ? (parsed.data.error.message ?? "") : "";
    throw new YouTubeApiError(
      res.status,
      reason,
      `videos.list returned HTTP ${res.status}: ${message}`,
    );
  }
  const parsed = VideosListResponseSchema.parse(body);
  return classifyResponse(ids, parsed.items);
}

/** Reserves quota units before each call. Implemented by the worker over Postgres. */
export type QuotaLedger = {
  /** Returns false when the day's budget cannot cover `units`. */
  reserve(units: number): Promise<boolean>;
  markExhausted(): Promise<void>;
};

export type CheckBatchResult = {
  checks: VideoCheck[];
  calls: number;
  stoppedFor: "done" | "budget" | "quota_exceeded";
};

/**
 * Checks IDs 50 at a time, reserving a unit before every call. Stops early when the budget
 * runs out or YouTube reports quotaExceeded (the job then waits for the Pacific reset).
 */
export async function checkVideos(
  ids: readonly string[],
  options: YouTubeClientOptions & { ledger: QuotaLedger },
): Promise<CheckBatchResult> {
  const checks: VideoCheck[] = [];
  let calls = 0;
  for (const batch of chunk([...new Set(ids)], YOUTUBE.idsPerCall)) {
    if (!(await options.ledger.reserve(YOUTUBE.unitsPerVideosListCall))) {
      return { checks, calls, stoppedFor: "budget" };
    }
    calls++;
    try {
      checks.push(...(await videosList(batch, options)));
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        await options.ledger.markExhausted();
        return { checks, calls, stoppedFor: "quota_exceeded" };
      }
      throw err;
    }
  }
  return { checks, calls, stoppedFor: "done" };
}
