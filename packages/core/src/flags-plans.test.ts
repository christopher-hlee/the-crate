import { describe, expect, it } from "vitest";
import { readFlags } from "./flags";
import { canAddCrateItems, canCreateCrate, effectivePlan, limitsFor } from "./plans";
import { isReportablePlayerError } from "./player";

describe("readFlags", () => {
  it("defaults every flag to off and accepts common truthy values", () => {
    expect(readFlags({})).toEqual({
      FEATURE_GETSONGBPM: false,
      FEATURE_PLAYLIST_EXPORT: false,
      FEATURE_CLEARED_LANE: false,
      FEATURE_ADS: false,
    });
    const flags = readFlags({
      FEATURE_GETSONGBPM: "true",
      FEATURE_ADS: " 1 ",
      FEATURE_CLEARED_LANE: "0",
    });
    expect(flags.FEATURE_GETSONGBPM).toBe(true);
    expect(flags.FEATURE_ADS).toBe(true);
    expect(flags.FEATURE_CLEARED_LANE).toBe(false);
  });
});

describe("plan limits", () => {
  it("gives Free favorites, saved filters, notes and 50 plays, but no crates", () => {
    const free = limitsFor("free");
    expect(free).toMatchObject({
      historyWindow: 50,
      maxFavorites: 10_000,
      maxSavedFilters: 200,
      notes: true,
      tempoVotes: true,
      comments: true,
    });
    expect(free).toMatchObject({
      proFilters: false,
      youtubePlaylist: false,
      crateExport: false,
      ads: true,
    });
    expect(canCreateCrate("free", 0)).toBe(false);
    expect(canAddCrateItems("free", 0)).toBe(false);
  });

  it("gives Pro 200 crates of 1,000 records, 1,000 plays and the power tools", () => {
    const pro = limitsFor("pro");
    expect(pro).toMatchObject({
      historyWindow: 1000,
      proFilters: true,
      youtubePlaylist: true,
      crateExport: true,
      ads: false,
    });
    expect(canCreateCrate("pro", 199)).toBe(true);
    expect(canCreateCrate("pro", 200)).toBe(false);
    expect(canAddCrateItems("pro", 999)).toBe(true);
    expect(canAddCrateItems("pro", 1000)).toBe(false);
  });

  it("treats expired or missing subscriptions as Free", () => {
    const now = new Date("2026-10-03T00:00:00Z");
    expect(effectivePlan(null, now)).toBe("free");
    expect(effectivePlan({ plan: "pro", expiresAt: null }, now)).toBe("pro");
    expect(effectivePlan({ plan: "pro", expiresAt: new Date("2026-11-01T00:00:00Z") }, now)).toBe(
      "pro",
    );
    expect(effectivePlan({ plan: "pro", expiresAt: new Date("2026-10-02T00:00:00Z") }, now)).toBe(
      "free",
    );
    expect(effectivePlan({ plan: "free", expiresAt: null }, now)).toBe("free");
  });
});

describe("player errors", () => {
  it("reports only the codes that mean the video can't play here", () => {
    for (const code of [2, 5, 100, 101, 150]) expect(isReportablePlayerError(code)).toBe(true);
    for (const code of [0, 1, 153, 3]) expect(isReportablePlayerError(code)).toBe(false);
  });
});

import { mergeSubscription } from "./plans";

describe("mergeSubscription", () => {
  const now = new Date("2026-10-03T00:00:00Z");
  const later = new Date("2026-11-03T00:00:00Z");
  const muchLater = new Date("2027-10-03T00:00:00Z");

  it("takes events from the same source as they come", () => {
    const cur = { plan: "pro" as const, source: "stripe" as const, expiresAt: later };
    expect(
      mergeSubscription(cur, { plan: "free", source: "stripe", expiresAt: now }, now).plan,
    ).toBe("free");
  });

  it("never lets one source end an active Pro from another", () => {
    const store = { plan: "pro" as const, source: "app_store" as const, expiresAt: muchLater };
    const stripeCancel = { plan: "free" as const, source: "stripe" as const, expiresAt: now };
    expect(mergeSubscription(store, stripeCancel, now)).toBe(store);
    const stripeShorter = { plan: "pro" as const, source: "stripe" as const, expiresAt: later };
    expect(mergeSubscription(store, stripeShorter, now)).toBe(store);
    const stripeLonger = { plan: "pro" as const, source: "stripe" as const, expiresAt: null };
    expect(mergeSubscription(store, stripeLonger, now)).toBe(stripeLonger);
  });

  it("replaces an expired subscription from any source", () => {
    const old = {
      plan: "pro" as const,
      source: "play_store" as const,
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    };
    const fresh = { plan: "pro" as const, source: "stripe" as const, expiresAt: later };
    expect(mergeSubscription(old, fresh, now)).toBe(fresh);
  });
});
