// Favorites, saved filters, scopes, playlist links and comments: the pure parts.

import { ApiError, type RecordDetail, type ShufflePick } from "@app/api-client";
import { FiltersSchema, normalizeFilters } from "@app/core";
import { describe, expect, it, vi } from "vitest";
import { timeAgo } from "./comments";
import { errorMessage, isApiError } from "./errors";
import { createFavoriteStore, itemKey } from "./favorites";
import {
  applyKeywords,
  bpmText,
  CAMELOT_KEYS,
  hasFilters,
  MAX_VIEWS_OPTIONS,
  NAME_PROMPT,
  parseBpm,
  presetMatches,
  presetProblem,
  toggleIn,
  withBpm,
} from "./filter-panel";
import { partLabel, playlistParts } from "./playlist";
import { moreFromScopes, scopeLabel, withoutScopes } from "./scopes";

const vid = (n: number) => `vid${String(n).padStart(8, "0")}`;
const CHANNEL = `UC${"a".repeat(22)}`;

function pick(over: Partial<ShufflePick> = {}): ShufflePick {
  return {
    recordKey: "m:123",
    videoId: vid(1),
    releaseId: 456,
    track: null,
    record: {
      title: "Title",
      artist: "Artist",
      label: "Label",
      catno: "LAB 1",
      year: 1972,
      country: "US",
      styles: ["Soul"],
      discogsUrl: "https://www.discogs.com/master/123",
    },
    tempo: null,
    thumbnailUrl: null,
    channel: null,
    favorited: false,
    ...over,
  };
}

function detail(over: Partial<RecordDetail> = {}): RecordDetail {
  return {
    recordKey: "m:123",
    discogsUrl: "https://www.discogs.com/master/123",
    title: "Title",
    artist: "Artist",
    artists: [],
    labels: [],
    year: 1972,
    country: "US",
    genres: [],
    styles: [],
    formats: [],
    pressings: 1,
    tracklist: [],
    videos: [],
    ...over,
  };
}

describe("errorMessage", () => {
  it("passes on the server's message for expected errors", () => {
    const err = new ApiError(403, "limit_reached", "You can keep up to 200 saved filters.");
    expect(errorMessage(err, "fallback")).toBe("You can keep up to 200 saved filters.");
  });

  it("uses friendly text for network trouble, rate limits and server faults", () => {
    expect(errorMessage(new ApiError(0, "network", "fetch failed"), "x")).toMatch(/connection/);
    expect(errorMessage(new ApiError(429, "rate_limited", "HTTP 429"), "x")).toMatch(/moment/);
    expect(errorMessage(new ApiError(500, "internal", "HTTP 500"), "Try again.")).toBe(
      "Try again.",
    );
    expect(errorMessage(new Error("boom"), "Try again.")).toBe("Try again.");
  });

  it("takes per-call overrides, such as the taken display name", () => {
    const err = new ApiError(409, "conflict", "That name is taken.");
    expect(errorMessage(err, "x", { conflict: "That name is taken. Try another." })).toBe(
      "That name is taken. Try another.",
    );
    expect(isApiError(err, "conflict")).toBe(true);
    expect(isApiError(err, "not_found")).toBe(false);
  });
});

describe("favorite store", () => {
  it("remembers known states and notifies only on change", () => {
    const store = createFavoriteStore();
    const ref = { recordKey: "m:1", videoId: vid(1) };
    const listener = vi.fn();
    const off = store.subscribe(listener);
    expect(store.get(ref)).toBeUndefined();
    store.set(ref, true);
    store.set(ref, true);
    expect(store.get(ref)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const v = store.version();
    store.setMany([ref, { recordKey: "m:2", videoId: vid(2) }], true);
    expect(store.version()).toBe(v + 1);
    store.clear();
    expect(store.get(ref)).toBeUndefined();
    off();
    store.set(ref, false);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("keys by record and video", () => {
    expect(itemKey({ recordKey: "r:9", videoId: vid(3) })).toBe(`r:9/${vid(3)}`);
  });
});

describe("playlist parts", () => {
  it("labels a single link plainly and several as parts", () => {
    expect(partLabel(0, 1)).toBe("Open in YouTube");
    expect(partLabel(0, 3)).toBe("Part 1");
    expect(partLabel(2, 3)).toBe("Part 3");
  });

  it("makes one link per 50 playable videos, skipping unavailable ones and repeats", () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      videoId: vid(i),
      available: i % 10 !== 9,
    }));
    items.push({ videoId: vid(0), available: true });
    const parts = playlistParts(items);
    expect(parts.map((p) => p.label)).toEqual(["Part 1", "Part 2", "Part 3"]);
    expect(parts.map((p) => p.count)).toEqual([50, 50, 8]);
    expect(parts[0]?.url).toMatch(/^https:\/\/www\.youtube\.com\/watch_videos\?video_ids=/);
    expect(parts[0]?.url).not.toContain(vid(9));
    expect(playlistParts([{ videoId: vid(1), available: false }])).toEqual([]);
  });
});

describe("filter panel helpers", () => {
  it("parses BPM boxes within 20 to 400", () => {
    expect(parseBpm("")).toBeUndefined();
    expect(parseBpm(" 98 ")).toBe(98);
    expect(parseBpm("97,5")).toBe(97.5);
    expect(parseBpm("12")).toBeUndefined();
    expect(parseBpm("401")).toBeUndefined();
    expect(parseBpm("fast")).toBeUndefined();
    expect(bpmText(undefined)).toBe("");
    expect(bpmText(120)).toBe("120");
  });

  it("applies the BPM boxes, clearing an empty or invalid end", () => {
    expect(withBpm({ styles: ["Soul"], bpmTo: 130 }, "90", "")).toEqual({
      styles: ["Soul"],
      bpmFrom: 90,
      bpmTo: undefined,
    });
    expect(withBpm({ bpmFrom: 90 }, "5", "110")).toMatchObject({
      bpmFrom: undefined,
      bpmTo: 110,
    });
  });

  it("offers valid key and view-count values", () => {
    expect(CAMELOT_KEYS).toHaveLength(24);
    for (const k of CAMELOT_KEYS) expect(FiltersSchema.safeParse({ key: k }).success).toBe(true);
    for (const o of MAX_VIEWS_OPTIONS)
      expect(FiltersSchema.safeParse({ maxViews: o.value }).success).toBe(true);
  });

  it("toggles list values", () => {
    expect(toggleIn(undefined, "Funk")).toEqual(["Funk"]);
    expect(toggleIn(["Funk"], "Funk")).toBeUndefined();
    expect(toggleIn(["Funk"], "Soul")).toEqual(["Funk", "Soul"]);
  });

  it("applies keywords of 2 or more characters on submit", () => {
    expect(applyKeywords({}, "  drum   break ")).toEqual({
      filters: { q: "drum break" },
      error: null,
    });
    expect(applyKeywords({ q: "old" }, "  ")).toEqual({ filters: { q: undefined }, error: null });
    expect(applyKeywords({}, "x").error).toMatch(/at least 2/);
  });

  it("shows Clear only when a filter actually applies", () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ styles: undefined, bpmFrom: undefined })).toBe(false);
    expect(hasFilters({ styles: [] })).toBe(false);
    expect(hasFilters({ halfDouble: true })).toBe(false);
    expect(hasFilters({ maxViews: 1000 })).toBe(true);
  });

  it("checks a filter set before saving it", () => {
    const saved = [{ id: "1", name: "Soul", filters: { styles: ["Soul"] } }];
    const base = { filters: { styles: ["Funk"] }, saved, max: 2, proFilters: false };
    expect(presetProblem({ ...base, name: "Funk" })).toBeNull();
    expect(presetProblem({ ...base, name: "  " })).toBe(NAME_PROMPT);
    expect(presetProblem({ ...base, name: "x", filters: {} })).toMatch(/Choose some filters/);
    expect(presetProblem({ ...base, name: "x", filters: { q: "breaks" } })).toMatch(/Pro tools/);
    expect(
      presetProblem({ ...base, name: "x", filters: { q: "breaks" }, proFilters: true }),
    ).toBeNull();
    expect(presetProblem({ ...base, name: "New", max: 1 })).toMatch(/saved 1 filter sets/);
    // Same name replaces, so the limit doesn't apply.
    expect(presetProblem({ ...base, name: "Soul", max: 1 })).toBeNull();
    // A channel scope is YouTube data, so a set with one is never saved, even on Pro.
    const channel = { channelIds: ["UCaaaaaaaaaaaaaaaaaaaaaa"], styles: ["Funk"] };
    expect(presetProblem({ ...base, name: "x", filters: channel, proFilters: true })).toMatch(
      /channel/,
    );
  });

  it("matches a preset to equivalent filters", () => {
    expect(presetMatches({ styles: ["Soul", "Funk"] }, { styles: ["Funk", "Soul"] })).toBe(true);
    expect(presetMatches({ styles: ["Soul"] }, { styles: ["Funk"] })).toBe(false);
    expect(presetMatches({}, {})).toBe(false);
  });
});

describe("more-from scopes", () => {
  it("always offers the release, and the channel when it has a valid ID", () => {
    expect(moreFromScopes(pick(), null).map((s) => s.filters)).toEqual([{ recordKeys: ["m:123"] }]);
    const withChannel = moreFromScopes(
      pick({ channel: { id: CHANNEL, title: "Artist - Topic", topic: true } }),
      null,
    );
    expect(withChannel[1]).toMatchObject({
      label: "More from this channel",
      hint: "Artist - Topic",
      filters: { channelIds: [CHANNEL] },
    });
    expect(
      moreFromScopes(pick({ channel: { id: "nope", title: "x", topic: false } }), null),
    ).toHaveLength(1);
  });

  it("adds labels and artists with Discogs IDs, skipping placeholders and repeats", () => {
    const scopes = moreFromScopes(
      pick(),
      detail({
        labels: [
          { id: 1, name: "Blue Note", catno: "BN 1" },
          { id: 1, name: "Blue Note", catno: "BN 2" },
          { id: null, name: "Self-released", catno: "" },
          { id: 750, name: "Not On Label (Artist Self-released)", catno: "" },
        ],
        artists: [
          { id: 194, name: "Various" },
          { id: 7, name: "Lee Morgan" },
        ],
      }),
    );
    expect(scopes.map((s) => s.label)).toEqual([
      "More from this release",
      "More on Blue Note",
      "More by Lee Morgan",
    ]);
    for (const s of scopes) expect(FiltersSchema.safeParse(s.filters).success).toBe(true);
  });

  it("names the active scope and removes it", () => {
    expect(scopeLabel({})).toBeNull();
    expect(scopeLabel({ recordKeys: ["m:1"] })).toBe("More from this release");
    expect(scopeLabel({ channelIds: [CHANNEL] })).toBe("More from this channel");
    expect(scopeLabel({ labelIds: [1] })).toBe("More on this label");
    expect(scopeLabel({ artistIds: [1] })).toBe("More by this artist");
    expect(
      normalizeFilters(withoutScopes({ recordKeys: ["m:1"], artistIds: [2], styles: ["Soul"] })),
    ).toEqual({ styles: ["Soul"] });
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  it("counts back in friendly units", () => {
    expect(timeAgo("2026-10-05T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-05T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-05T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-03T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-06-01T12:00:00Z", now)).toBe("4mo ago");
    expect(timeAgo("2024-10-01T12:00:00Z", now)).toBe("2y ago");
    expect(timeAgo("2026-10-06T12:00:00Z", now)).toBe("just now");
  });
});
