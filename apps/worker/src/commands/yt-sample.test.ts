import { describe, expect, it } from "vitest";
import { DistinctSample, summarise, validateSample, wilson } from "./yt-sample";

describe("DistinctSample", () => {
  it("keeps k distinct IDs regardless of repeats and order", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `id${i}`);
    const a = new DistinctSample(50);
    const b = new DistinctSample(50);
    for (const id of [...ids, ...ids]) a.add(id);
    for (const id of [...ids].reverse()) b.add(id);
    expect(a.values()).toHaveLength(50);
    expect(new Set(a.values()).size).toBe(50);
    expect(a.values()).toEqual(b.values());
  });

  it("returns everything when fewer than k distinct IDs arrive", () => {
    const s = new DistinctSample(10);
    for (const id of ["a", "b", "a"]) s.add(id);
    expect(s.values().sort()).toEqual(["a", "b"]);
  });
});

describe("summaries", () => {
  it("computes a Wilson interval", () => {
    const w = wilson(80, 100);
    expect(w.low).toBeCloseTo(0.7112, 3);
    expect(w.high).toBeCloseTo(0.8667, 3);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it("summarises statuses and region restrictions", () => {
    const base = {
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
    const r = summarise(
      [
        { ...base, videoId: "a", status: "playable", regionBlocked: ["DE"] },
        { ...base, videoId: "b", status: "playable" },
        { ...base, videoId: "c", status: "unavailable" },
        { ...base, videoId: "d", status: "made_for_kids" },
      ],
      1,
      "done",
    );
    expect(r).toMatchObject({
      sampled: 4,
      playableShare: 0.5,
      regionRestrictedShareOfPlayable: 0.5,
      madeForKidsShare: 0.25,
      byStatus: { playable: 2, unavailable: 1, made_for_kids: 1 },
    });
  });

  it("spends exactly one unit per 50 IDs", async () => {
    const calls: string[] = [];
    const ids = Array.from({ length: 120 }, (_, i) => `v${String(i).padStart(10, "0")}`);
    const report = await validateSample(ids, {
      apiKey: "k",
      fetch: async (url) => {
        calls.push(url);
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      },
    });
    expect(calls).toHaveLength(3);
    expect(report).toMatchObject({ sampled: 120, calls: 3, stoppedFor: "done", playableShare: 0 });
  });
});
