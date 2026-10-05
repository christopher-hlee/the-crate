// Pro on the web: gating, export, share links, seeded crates, the daily dig, and the tools
// that stay free (notes, tempo votes).

import { expect, test } from "@playwright/test";
import { expectCompliantPlayer, signIn, sql } from "./helpers";
import { stubYouTube } from "./youtube-stub";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

async function crateWithItems(userId: string, opts: { seed?: number; filters?: object } = {}) {
  const [crate] = await sql<{ id: string }>(
    "insert into crates (user_id, name, seed, filters) values ($1, 'Pro crate', $2, $3) returning id",
    [userId, opts.seed ?? null, opts.filters ? JSON.stringify(opts.filters) : null],
  );
  const items = await sql<{ record_key: string; video_id: string }>(
    "select record_key, video_id from record_videos where playable order by rand_key limit 3",
  );
  for (const [i, it] of items.entries()) {
    await sql(
      "insert into crate_items (crate_id, record_key, video_id, position) values ($1, $2, $3, $4)",
      [crate?.id, it.record_key, it.video_id, i],
    );
  }
  return { id: crate?.id as string, items };
}

test("Free accounts are refused Pro tools on the server", async ({ page }) => {
  const userId = await signIn(page);
  const { id } = await crateWithItems(userId);
  const checks = [
    page.request.get(`/api/v1/crates/${id}/export?format=csv`),
    page.request.post(`/api/v1/crates/${id}/share`),
    page.request.get("/api/v1/shuffle?q=night"),
    page.request.post("/api/v1/crates", { data: { name: "Seeded", seed: 42 } }),
  ];
  for (const res of await Promise.all(checks)) {
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("pro_required");
  }
});

test("Pro: export a crate sheet with links only, as CSV and JSON", async ({ page }) => {
  const userId = await signIn(page, { pro: true });
  const { id, items } = await crateWithItems(userId);
  await sql(
    "insert into notes (user_id, record_key, video_id, at_seconds, body) values ($1, $2, $3, 95, 'break here')",
    [userId, items[0]?.record_key, items[0]?.video_id],
  );
  const csv = await page.request.get(`/api/v1/crates/${id}/export?format=csv`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.split("\r\n")[0]).toBe(
    "artist,title,track,label,catno,year,country,styles,bpm,camelotKey,youtubeUrl,discogsUrl,note",
  );
  expect(text).toContain(`https://www.youtube.com/watch?v=${items[0]?.video_id}&t=95s`);
  expect(text).toContain("break here");
  expect(text).not.toMatch(/\.(mp3|wav|m4a|webm|mp4)\b/);
  expect(text).not.toContain("i.ytimg.com");
  const json = await (await page.request.get(`/api/v1/crates/${id}/export?format=json`)).json();
  expect(json.rows).toHaveLength(3);
});

test("Pro: share a crate; anyone can play it; revoking kills the link", async ({
  page,
  browser,
}) => {
  const userId = await signIn(page, { pro: true });
  const { id } = await crateWithItems(userId);
  await sql("update crate_items set note = 'private thought' where crate_id = $1", [id]);
  const share = await (await page.request.post(`/api/v1/crates/${id}/share`)).json();
  expect(share.url).toMatch(/\/shared\/[A-Za-z0-9_-]+$/);
  const anon = await browser.newPage();
  await stubYouTube(anon);
  await anon.goto(`/shared/${share.shareId}`);
  await expect(anon.getByTestId("item-row")).toHaveCount(3);
  const shared = await (await anon.request.get(`/api/v1/shared/${share.shareId}`)).json();
  expect(shared.items.map((i: { note: string | null }) => i.note)).toEqual([null, null, null]);
  await page.request.delete(`/api/v1/crates/${id}/share`);
  expect((await anon.request.get(`/api/v1/shared/${share.shareId}`)).status()).toBe(404);
  await anon.close();
});

test("Pro: a seeded crate replays the same order, one player at a time", async ({ page }, info) => {
  const userId = await signIn(page, { pro: true });
  const { id } = await crateWithItems(userId, { seed: 1234, filters: { genres: ["Electronic"] } });
  const a = await (await page.request.get(`/api/v1/crates/${id}/sequence?page=0`)).json();
  const b = await (await page.request.get(`/api/v1/crates/${id}/sequence?page=0`)).json();
  expect(a.items.length).toBeGreaterThan(0);
  expect(a.items.map((i: { videoId: string }) => i.videoId)).toEqual(
    b.items.map((i: { videoId: string }) => i.videoId),
  );
  await page.goto(`/crates/${id}`);
  await page.getByRole("tab", { name: "Seeded order" }).click();
  await expect(page.getByTestId("sequence-coverage")).toBeVisible();
  await expectCompliantPlayer(
    page,
    info.project.name === "desktop" ? { width: 480, height: 270 } : { width: 200, height: 200 },
  );
});

test("the daily dig is free to play and the same for everyone", async ({ page }, info) => {
  await page.goto("/daily");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Today's dig");
  await expect(page.getByTestId("item-row").first()).toBeVisible();
  await expectCompliantPlayer(
    page,
    info.project.name === "desktop" ? { width: 480, height: 270 } : { width: 200, height: 200 },
  );
  const one = await (await page.request.get("/api/v1/daily")).json();
  const two = await (await page.request.get("/api/v1/daily")).json();
  expect(one.items.map((i: { videoId: string }) => i.videoId)).toEqual(
    two.items.map((i: { videoId: string }) => i.videoId),
  );
});

test("Free: timestamped notes are free", async ({ page }) => {
  const userId = await signIn(page);
  const [rv] = await sql<{ record_key: string; video_id: string }>(
    "select record_key, video_id from record_videos where playable limit 1",
  );
  const res = await page.request.post("/api/v1/notes", {
    data: { recordKey: rv?.record_key, videoId: rv?.video_id, atSeconds: 42, body: "horns" },
  });
  expect(res.status()).toBe(201);
  const list = await (await page.request.get(`/api/v1/notes?videoId=${rv?.video_id}`)).json();
  expect(list.notes.map((n: { body: string }) => n.body)).toEqual(["horns"]);
  expect(await sql("select 1 from notes where user_id = $1", [userId])).toHaveLength(1);
});

test("Free: tempo votes feed the community estimate", async ({ page }) => {
  await signIn(page);
  const [track] = await sql<{ release_id: number; track_position: string }>(
    "select release_id, track_position from record_videos where track_position is not null limit 1",
  );
  const res = await page.request.post("/api/v1/tempo-votes", {
    data: {
      releaseId: Number(track?.release_id),
      trackPosition: track?.track_position,
      bpm: 124,
      camelotKey: "8A",
    },
  });
  expect(res.status()).toBe(202);
  const bad = await page.request.post("/api/v1/tempo-votes", {
    data: { releaseId: 1, trackPosition: "Z9", bpm: 124 },
  });
  expect(bad.status()).toBe(404);
});
