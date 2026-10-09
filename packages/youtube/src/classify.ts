// Turns a videos.list response into per-video outcomes (docs/SPEC.md "Validation outcomes").

import { parseIsoDuration } from "@app/core";
import type { VideoItem } from "./schema";

export type CheckedStatus = "playable" | "not_embeddable" | "unavailable" | "made_for_kids";

export type VideoCheck = {
  videoId: string;
  status: CheckedStatus;
  /** YouTube API data, stored only for playable videos and refreshed within 30 days. */
  title: string | null;
  durationS: number | null;
  viewCount: number | null;
  thumbnailUrl: string | null;
  regionAllowed: string[] | null;
  regionBlocked: string[] | null;
  /** The uploading channel and the video's tags: filters only ("topic", "more from", keywords). */
  channelId: string | null;
  channelTitle: string | null;
  tags: string[] | null;
};

const DEAD_UPLOAD = new Set(["deleted", "failed", "rejected"]);

/** At least 120×70 for a thumbnail that starts playback (rule 4): prefer 320×180. */
const THUMBNAIL_PREFERENCE = ["medium", "high", "standard", "default"];

function thumbnail(item: VideoItem): string | null {
  const thumbs = item.snippet?.thumbnails;
  if (!thumbs) return null;
  for (const key of THUMBNAIL_PREFERENCE) {
    const t = thumbs[key];
    if (
      t &&
      (t.width === undefined || t.width >= 120) &&
      (t.height === undefined || t.height >= 70)
    ) {
      return t.url;
    }
  }
  return null;
}

function countryCodes(values: string[] | undefined): string[] | null {
  if (!values) return null;
  return values.filter((c) => /^[A-Z]{2}$/.test(c)).sort();
}

function empty(videoId: string, status: CheckedStatus): VideoCheck {
  return {
    videoId,
    status,
    title: null,
    durationS: null,
    viewCount: null,
    thumbnailUrl: null,
    regionAllowed: null,
    regionBlocked: null,
    channelId: null,
    channelTitle: null,
    tags: null,
  };
}

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** At most 50 tags of at most 100 characters: enough for keyword matching, bounded in size. */
function cleanTags(tags: string[] | undefined): string[] | null {
  if (!tags || tags.length === 0) return null;
  return tags
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((t) => t.slice(0, 100));
}

export function classifyItem(item: VideoItem): VideoCheck {
  const st = item.status;
  if (st?.uploadStatus && DEAD_UPLOAD.has(st.uploadStatus)) return empty(item.id, "unavailable");
  if (st?.privacyStatus === "private") return empty(item.id, "unavailable");
  if (st?.embeddable === false) return empty(item.id, "not_embeddable");
  if (st?.madeForKids === true) return empty(item.id, "made_for_kids");
  const views = item.statistics?.viewCount;
  return {
    videoId: item.id,
    status: "playable",
    title: item.snippet?.title ?? null,
    durationS: parseIsoDuration(item.contentDetails?.duration),
    viewCount: views !== undefined && /^\d+$/.test(views) ? Number(views) : null,
    thumbnailUrl: thumbnail(item),
    regionAllowed: countryCodes(item.contentDetails?.regionRestriction?.allowed),
    regionBlocked: countryCodes(item.contentDetails?.regionRestriction?.blocked),
    channelId:
      item.snippet?.channelId && CHANNEL_ID.test(item.snippet.channelId)
        ? item.snippet.channelId
        : null,
    channelTitle: item.snippet?.channelTitle?.slice(0, 200) ?? null,
    tags: cleanTags(item.snippet?.tags),
  };
}

/** Outcomes for every requested ID. IDs missing from the response are unavailable. */
export function classifyResponse(
  requested: readonly string[],
  items: readonly VideoItem[],
): VideoCheck[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return requested.map((id) => {
    const item = byId.get(id);
    return item ? classifyItem(item) : empty(id, "unavailable");
  });
}
