import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildVideosListUrl,
  checkVideos,
  type FetchLike,
  QuotaExceededError,
  type QuotaLedger,
  videosList,
  YouTubeApiError,
} from "./client";

type Recording = { requested?: string[]; status: number; body: unknown };

function recording(name: string): Recording {
  const path = new URL(`../../../fixtures/youtube/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Recording;
}

function replay(rec: Recording, seen: string[] = []): FetchLike {
  return async (url) => {
    seen.push(url);
    return { ok: rec.status < 400, status: rec.status, json: async () => rec.body };
  };
}

function ledger(budget: number): QuotaLedger & { used: number; exhausted: boolean } {
  return {
    used: 0,
    exhausted: false,
    async reserve(units) {
      if (this.exhausted || this.used + units > budget) return false;
      this.used += units;
      return true;
    },
    async markExhausted() {
      this.exhausted = true;
    },
  };
}

describe("videosList", () => {
  const mixed = recording("videos-list-mixed.json");
  const ids = mixed.requested ?? [];

  it("builds a documented videos.list request", () => {
    const url = new URL(buildVideosListUrl(["a1", "b2"], "KEY"));
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("snippet,contentDetails,status,statistics");
    expect(url.searchParams.get("id")).toBe("a1,b2");
    expect(url.searchParams.get("key")).toBe("KEY");
  });

  it("classifies every requested ID", async () => {
    const checks = await videosList(ids, { apiKey: "k", fetch: replay(mixed) });
    const byId = Object.fromEntries(checks.map((c) => [c.videoId, c]));
    expect(checks).toHaveLength(ids.length);
    expect(byId.GlassHarb01).toEqual({
      videoId: "GlassHarb01",
      status: "playable",
      title: "Marlo Venn - Glass Harbour",
      durationS: 372,
      viewCount: 48213,
      thumbnailUrl: "https://i.ytimg.com/vi/GlassHarb01/mqdefault.jpg",
      regionAllowed: null,
      regionBlocked: ["AT", "DE"],
    });
    expect(byId.NightFerry1?.regionAllowed).toEqual(["CA", "US"]);
    expect(byId.NightFerry1?.thumbnailUrl).toBe("https://i.ytimg.com/vi/NightFerry1/default.jpg");
    expect(byId.LowTideDub9?.status).toBe("not_embeddable");
    expect(byId.CalleOcho_1?.status).toBe("made_for_kids");
    expect(byId.NeonRain_77?.status).toBe("unavailable");
    expect(byId.LastTrain_1).toMatchObject({
      status: "playable",
      viewCount: null,
      thumbnailUrl: null,
    });
    expect(byId.CratesDJh01?.status).toBe("unavailable"); // missing from the response
  });

  it("stores no YouTube data for videos that can't play", async () => {
    const checks = await videosList(ids, { apiKey: "k", fetch: replay(mixed) });
    for (const c of checks.filter((x) => x.status !== "playable")) {
      expect(c).toMatchObject({
        title: null,
        durationS: null,
        viewCount: null,
        thumbnailUrl: null,
      });
    }
  });

  it("raises QuotaExceededError on a 403 quotaExceeded", async () => {
    await expect(
      videosList(["GlassHarb01"], {
        apiKey: "k",
        fetch: replay(recording("error-quota-exceeded.json")),
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("raises YouTubeApiError on other failures", async () => {
    const err = videosList(["GlassHarb01"], {
      apiKey: "k",
      fetch: replay({
        status: 400,
        body: { error: { code: 400, message: "bad", errors: [{ reason: "badRequest" }] } },
      }),
    });
    await expect(err).rejects.toBeInstanceOf(YouTubeApiError);
  });

  it("rejects more than 50 IDs per call", async () => {
    await expect(videosList(Array(51).fill("x"), { apiKey: "k" })).rejects.toThrow(/at most 50/);
  });
});

describe("checkVideos", () => {
  const ids = Array.from({ length: 120 }, (_, i) => `id${String(i).padStart(9, "0")}`);

  it("batches 50 IDs per call and reserves a unit for each", async () => {
    const urls: string[] = [];
    const l = ledger(100);
    const res = await checkVideos([...ids, ids[0] as string], {
      apiKey: "k",
      ledger: l,
      fetch: replay({ status: 200, body: { items: [] } }, urls),
    });
    expect(res).toMatchObject({ calls: 3, stoppedFor: "done" });
    expect(res.checks).toHaveLength(120);
    expect(l.used).toBe(3);
    expect(urls.map((u) => new URL(u).searchParams.get("id")?.split(",").length)).toEqual([
      50, 50, 20,
    ]);
  });

  it("stops when the budget runs out", async () => {
    const res = await checkVideos(ids, {
      apiKey: "k",
      ledger: ledger(2),
      fetch: replay({ status: 200, body: { items: [] } }),
    });
    expect(res).toMatchObject({ calls: 2, stoppedFor: "budget" });
    expect(res.checks).toHaveLength(100);
  });

  it("marks the day exhausted on quotaExceeded", async () => {
    const l = ledger(100);
    const res = await checkVideos(ids, {
      apiKey: "k",
      ledger: l,
      fetch: replay(recording("error-quota-exceeded.json")),
    });
    expect(res).toMatchObject({ calls: 1, stoppedFor: "quota_exceeded", checks: [] });
    expect(l.exhausted).toBe(true);
  });
});
