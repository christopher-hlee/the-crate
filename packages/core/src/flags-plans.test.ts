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
  it("caps Free at 3 crates of 50 records and 50 plays", () => {
    expect(limitsFor("free").historyWindow).toBe(50);
    expect(canCreateCrate("free", 2)).toBe(true);
    expect(canCreateCrate("free", 3)).toBe(false);
    expect(canAddCrateItems("free", 49)).toBe(true);
    expect(canAddCrateItems("free", 50)).toBe(false);
    expect(canAddCrateItems("free", 48, 3)).toBe(false);
  });

  it("leaves Pro unlimited with 1,000 plays", () => {
    expect(limitsFor("pro").historyWindow).toBe(1000);
    expect(canCreateCrate("pro", 10_000)).toBe(true);
    expect(canAddCrateItems("pro", 10_000)).toBe(true);
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
