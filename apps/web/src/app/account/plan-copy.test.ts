import { PLAN_LIMITS } from "@app/core";
import { describe, expect, it } from "vitest";
import { freeFeatures, limitsSummary, proFeatures } from "./plan-copy";

describe("plan copy", () => {
  it("lists what a signed-in Free account gets", () => {
    expect(freeFeatures()).toEqual([
      "Favorites (up to 10,000)",
      "200 saved filters",
      "Notes",
      "Tempo, key and max-views filters",
      "Tap tempo and tempo/key votes",
      "Comments",
      "50-play history",
    ]);
  });

  it("lists what Pro adds", () => {
    expect(proFeatures()).toEqual([
      "Crates (200 × 1,000 records)",
      'Keyword, topic-channel and "more from" filters (release, channel, label, artist)',
      "Deep-cut and format-note filters",
      "1,000-play history",
      "CSV and JSON crate sheets",
      "Share links and seeded crates",
      "Open as YouTube playlist",
      "No ads",
    ]);
  });

  it("follows the limits rather than fixed text", () => {
    const l = { ...PLAN_LIMITS.pro, maxCrates: null, historyWindow: 5000, ads: true };
    expect(proFeatures(l)).toContain("Unlimited crates");
    expect(proFeatures(l)).toContain("5,000-play history");
    expect(proFeatures(l)).not.toContain("No ads");
  });

  it("summarises the viewer's limits without a zero-crate line on Free", () => {
    expect(limitsSummary(PLAN_LIMITS.free)).toBe(
      "10,000 favorites · 200 saved filters · history keeps your last 50 plays",
    );
    expect(limitsSummary(PLAN_LIMITS.pro)).toBe(
      "Crates (200 × 1,000 records) · 10,000 favorites · 200 saved filters · history keeps your last 1,000 plays",
    );
  });
});
