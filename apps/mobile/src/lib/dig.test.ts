// Dig's pure parts that keep one viewer's state away from another and keep the shuffle honest:
// shuffle exclusions, trusting a pick's `favorited`, late record details, Pro filters on Free.

import { readFileSync } from "node:fs";
import type { RecordDetail, ShufflePick } from "@app/api-client";
import { type Filters, normalizeFilters, PRO_FILTER_KEYS, proFiltersUsed } from "@app/core";
import { describe, expect, it } from "vitest";
import { cappedList, shuffleExclusions } from "./exclusions";
import { favoritedFor } from "./favorites";
import { presetLocked, withoutProFilters } from "./filter-panel";
import { detailFor, moreFromScopes } from "./scopes";

const vid = (n: number) => `vid${String(n).padStart(8, "0")}`;

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

describe("shuffle exclusions", () => {
  it("sends the device's seen list while signed out", () => {
    const session = cappedList();
    const seen = cappedList();
    session.add("m:1");
    seen.add(vid(1));
    seen.add(vid(2));
    expect(shuffleExclusions({ session, seen, signedIn: false, current: vid(2) })).toEqual({
      session: ["m:1"],
      seen: [vid(1), vid(2)],
    });
  });

  it("keeps the current video out for signed-in viewers too, so a scope never repeats it", () => {
    const session = cappedList();
    const seen = cappedList();
    session.add("m:1");
    seen.add(vid(9));
    expect(shuffleExclusions({ session, seen, signedIn: true, current: vid(3) })).toEqual({
      session: ["m:1"],
      seen: [vid(3)],
    });
    expect(shuffleExclusions({ session, seen, signedIn: true, current: null }).seen).toEqual([]);
  });

  it("hands out copies, so later adds don't change a request already built", () => {
    const session = cappedList();
    const seen = cappedList();
    const ex = shuffleExclusions({ session, seen, signedIn: false, current: null });
    session.add("m:2");
    seen.add(vid(4));
    expect(ex).toEqual({ session: [], seen: [] });
  });
});

describe("favoritedFor", () => {
  it("trusts a pick's favorited flag only for the viewer it was fetched for", () => {
    expect(favoritedFor(pick({ favorited: true }), "user-a", "user-a")).toBe(true);
    expect(favoritedFor(pick({ favorited: false }), "user-a", "user-a")).toBe(false);
    // Fetched for A, now B (or nobody) is signed in: unknown, shown as not favorited.
    expect(favoritedFor(pick({ favorited: true }), "user-a", "user-b")).toBe(false);
    expect(favoritedFor(pick({ favorited: true }), "user-a", null)).toBe(false);
    // Fetched signed out, then signed in: the server didn't know who was asking.
    expect(favoritedFor(pick({ favorited: true }), null, "user-a")).toBe(false);
    expect(favoritedFor(pick({ favorited: true }), null, null)).toBe(false);
  });
});

describe("detailFor", () => {
  it("drops a record detail that belongs to another pick", () => {
    const d = detail();
    expect(detailFor(pick(), d)).toBe(d);
    expect(detailFor(pick({ recordKey: "m:999" }), d)).toBeNull();
    expect(detailFor(pick(), null)).toBeNull();
  });

  it("never builds label or artist scopes from another record's detail", () => {
    const late = detail({
      recordKey: "m:777",
      labels: [{ id: 1, name: "Blue Note", catno: "BN 1" }],
      artists: [{ id: 7, name: "Lee Morgan" }],
    });
    expect(moreFromScopes(pick(), late).map((s) => s.label)).toEqual(["More from this release"]);
    expect(moreFromScopes(pick({ recordKey: "m:777" }), late).map((s) => s.label)).toEqual([
      "More from this release",
      "More on Blue Note",
      "More by Lee Morgan",
    ]);
  });
});

describe("screens use these per viewer", () => {
  // The screens need a React Native runtime, so these read their source.
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("Dig tags each pick with its viewer and drops late or foreign answers", () => {
    const dig = source("../../app/(tabs)/index.tsx");
    expect(dig).toContain("shuffleExclusions({");
    expect(dig).toMatch(/current: currentRef\.current\?\.videoId \?\? null/);
    expect(dig).toMatch(/favoritedFor\(shown\.pick, shown\.userId, userId\)/);
    expect(dig).not.toMatch(/current\??\.favorited/);
    expect(dig).toMatch(/queued\.userId === userRef\.current/);
    expect(dig).toMatch(/if \(stillShown\(\)\) setDetail\(d\)/);
    expect(dig).toContain("withoutProFilters(filtersRef.current)");
  });

  it("Favorites and History start fresh for each account", () => {
    expect(source("../../app/(tabs)/favorites.tsx")).toContain("<FavoritesList key={me.user.id}");
    expect(source("../../app/(tabs)/history.tsx")).toContain("<HistoryList key={me.user.id}");
  });

  it("saved sets with Pro filters never apply without Pro", () => {
    const presets = source("../components/SavedFilters.tsx");
    expect(presets).toContain("presetLocked(p.filters, proFilters)");
    expect(presets).toContain("if (!locked) onApply(p.filters)");
    expect(source("../components/FilterPanel.tsx")).toMatch(
      /<PresetList[^>]*proFilters=\{proFilters\}/,
    );
  });
});

describe("Pro filters without Pro", () => {
  it("locks a saved set that uses Pro filters for viewers without them", () => {
    expect(presetLocked({ q: "dilla" }, false)).toBe(true);
    expect(presetLocked({ topicOnly: true, styles: ["Soul"] }, false)).toBe(true);
    expect(presetLocked({ q: "dilla" }, true)).toBe(false);
    expect(presetLocked({ styles: ["Soul"], bpmFrom: 90 }, false)).toBe(false);
    expect(presetLocked({ topicOnly: false }, false)).toBe(false);
  });

  it("strips every Pro filter and keeps the free ones", () => {
    const all: Filters = {
      styles: ["Soul"],
      yearFrom: 1970,
      maxViews: 10_000,
      q: "dilla",
      topicOnly: true,
      recordKeys: ["m:1"],
      channelIds: [`UC${"a".repeat(22)}`],
      labelIds: [1],
      artistIds: [2],
      deepCutMin: 0.5,
      formatDescriptions: ["LP"],
    };
    const stripped = withoutProFilters(all);
    expect(stripped).toEqual(
      normalizeFilters({ styles: ["Soul"], yearFrom: 1970, maxViews: 10_000 }),
    );
    expect(stripped && proFiltersUsed(stripped)).toEqual([]);
    for (const k of PRO_FILTER_KEYS) expect(stripped).not.toHaveProperty(k);
  });

  it("returns null when there is nothing to strip", () => {
    expect(withoutProFilters({})).toBeNull();
    expect(withoutProFilters({ styles: ["Funk"], key: "8A" })).toBeNull();
    expect(withoutProFilters({ topicOnly: false })).toBeNull();
  });
});
