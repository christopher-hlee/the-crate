// Favorites: free for anyone signed in. One compliant player, inline notes, Play all with
// auto-advance, hearts on lists, and "Open in YouTube" links (a Pro tool).

import { expect, type Locator, type Page, test } from "@playwright/test";
import { expectCompliantPlayer, signIn, sql } from "./helpers";
import { stubYouTube, ytCalls } from "./youtube-stub";

const WATCH_VIDEOS = "https://www.youtube.com/watch_videos?video_ids=";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

function minFor(projectName: string) {
  return projectName === "desktop" ? { width: 480, height: 270 } : { width: 200, height: 200 };
}

type Ref = { record_key: string; video_id: string };

/** Playable records, a different slice per test so reports in one never touch another. */
function playable(n: number, offset: number): Promise<Ref[]> {
  return sql<Ref>(
    "select record_key, video_id from record_videos where playable order by rand_key limit $1 offset $2",
    [n, offset],
  );
}

/** Favorites through the API, oldest first (the list shows the newest first). */
async function favorite(page: Page, refs: Ref[]) {
  for (const r of refs) {
    const res = await page.request.post("/api/v1/favorites", {
      data: { recordKey: r.record_key, videoId: r.video_id },
    });
    expect(res.status()).toBe(201);
  }
}

/** The video IDs the favorites page lists, in order. */
async function listed(page: Page): Promise<string[]> {
  const body = await (await page.request.get("/api/v1/favorites")).json();
  return body.items.map((i: { videoId: string }) => i.videoId);
}

/** Simulates the stubbed YouTube player's events. */
function playerEvent(page: Page, event: { state: number } | { error: number }) {
  return page.evaluate((e) => {
    const yt = (
      window as unknown as {
        __yt: { players: { _set(s: number): void; __error(c: number): void }[] };
      }
    ).__yt;
    const player = yt.players[0];
    if (!player) throw new Error("no player");
    if ("state" in e) player._set(e.state);
    else player.__error(e.error);
  }, event);
}

async function lastLoaded(page: Page): Promise<string | undefined> {
  return (await ytCalls(page)).filter((c) => c.fn === "loadVideoById").at(-1)?.videoId;
}

/**
 * Clicks after scrolling and letting two frames render. Chromium can route a click sent right
 * after a long programmatic scroll to where the cross-origin player iframe used to be.
 */
async function clickSettled(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator
    .page()
    .evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await locator.click();
}

/** Autoplay needs more than half of the player on screen. */
async function playerVisible(page: Page) {
  await expect
    .poll(async () => Number(await page.locator("[data-player-box]").getAttribute("data-visible")))
    .toBeGreaterThan(0.5);
}

test("signed out: favorites ask you to sign in and hearts link to sign-in", async ({ page }) => {
  await page.goto("/favorites");
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/daily");
  await expect(page.getByTestId("item-row").first()).toBeVisible();
  await expect(
    page
      .getByTestId("item-row")
      .first()
      .getByRole("link", { name: /^Sign in to favorite/ }),
  ).toHaveAttribute("href", "/login?next=%2Fdaily");
});

test("favorites: one compliant player, an inline note, and heart off and on again", async ({
  page,
}, info) => {
  const userId = await signIn(page);
  await favorite(page, await playable(3, 0));
  await page.goto("/favorites");
  const rows = page.getByTestId("item-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("favorites-count")).toHaveText("3 of 10,000");
  await expect(page.getByRole("button", { name: /^Favorite/, pressed: true })).toHaveCount(3);
  await expectCompliantPlayer(page, minFor(info.project.name));

  const note = rows.first().getByRole("textbox", { name: /^Note on/ });
  await note.fill("Drop at 0:42");
  await note.press("Enter");
  await expect(rows.first()).toContainText("Saved");
  const notes = async () =>
    (await sql<{ note: string | null }>("select note from favorites where user_id = $1", [userId]))
      .map((r) => r.note)
      .filter(Boolean);
  await expect.poll(notes).toEqual(["Drop at 0:42"]);
  await page.reload();
  await expect(rows.first().getByRole("textbox")).toHaveValue("Drop at 0:42");

  // Heart off: the row stays where it is, marked, so the heart can put it back.
  const heart = rows.first().getByRole("button", { name: /^Favorite/ });
  await clickSettled(heart);
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect(rows.first()).toContainText("Removed from favorites");
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("favorites-count")).toHaveText("2 of 10,000");
  await expect
    .poll(async () => (await sql("select 1 from favorites where user_id = $1", [userId])).length)
    .toBe(2);
  await clickSettled(heart);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("favorites-count")).toHaveText("3 of 10,000");
  await expect.poll(notes).toEqual(["Drop at 0:42"]);
  await expect(rows.first().getByRole("textbox")).toHaveValue("Drop at 0:42");
  // Notes render inline in the rows: still nothing over the player.
  await expectCompliantPlayer(page, minFor(info.project.name));
});

test("Play all advances when a video ends and skips one that can't play", async ({ page }) => {
  await signIn(page);
  await favorite(page, await playable(3, 10));
  const order = await listed(page);
  expect(order).toHaveLength(3);
  await page.goto("/favorites");
  await expect(page.getByTestId("item-row")).toHaveCount(3);
  await playerVisible(page);

  await clickSettled(page.getByRole("button", { name: "Play all" }));
  await expect.poll(() => lastLoaded(page)).toBe(order[0]);
  await expect(page.getByTestId("item-row").nth(0)).toHaveAttribute("aria-current", "true");

  await playerEvent(page, { state: 0 }); // ended
  await expect.poll(() => lastLoaded(page)).toBe(order[1]);
  await expect(page.getByTestId("item-row").nth(1)).toHaveAttribute("aria-current", "true");

  const report = page.waitForRequest(
    (r) => r.url().endsWith(`/api/v1/videos/${order[1]}/report`) && r.method() === "POST",
  );
  await playerEvent(page, { error: 150 });
  expect((await report).postDataJSON()).toEqual({ code: 150 });
  await expect.poll(() => lastLoaded(page)).toBe(order[2]);
  await expect(page.getByRole("status")).toContainText("can't play here");

  // The end of the list: nothing more loads.
  const loads = (await ytCalls(page)).filter((c) => c.fn === "loadVideoById").length;
  await playerEvent(page, { state: 0 });
  await page.waitForTimeout(200);
  expect((await ytCalls(page)).filter((c) => c.fn === "loadVideoById")).toHaveLength(loads);
  expect((await ytCalls(page)).filter((c) => c.fn === "new")).toHaveLength(1);
});

test("hearts on a list show what is favorited and toggle it", async ({ page }) => {
  const userId = await signIn(page);
  const daily = await (await page.request.get("/api/v1/daily")).json();
  const [first, second] = daily.items as { recordKey: string; videoId: string }[];
  if (!first || !second) throw new Error("the daily dig needs two records");
  await favorite(page, [{ record_key: first.recordKey, video_id: first.videoId }]);
  await page.goto("/daily");
  const rows = page.getByTestId("item-row");
  await expect(rows.nth(0).getByRole("button", { name: /^Favorite/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(rows.nth(1).getByRole("button", { name: /^Favorite/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await clickSettled(rows.nth(1).getByRole("button", { name: /^Favorite/ }));
  await expect(rows.nth(1).getByRole("button", { name: /^Favorite/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(async () => (await sql("select 1 from favorites where user_id = $1", [userId])).length)
    .toBe(2);
});

test("Open in YouTube: locked on Free; Pro gets links of at most 50 videos", async ({ page }) => {
  await signIn(page);
  await favorite(page, await playable(2, 20));
  await page.goto("/favorites");
  await expect(page.getByTestId("item-row")).toHaveCount(2);
  await expect(page.getByTestId("youtube-links-locked")).toContainText("Pro tool");
  await expect(page.locator(`a[href^="${WATCH_VIDEOS}"]`)).toHaveCount(0);
  // Listening stays free: Play all is there for Free too.
  await expect(page.getByRole("button", { name: "Play all" })).toBeEnabled();

  const pro = await signIn(page, { pro: true });
  await sql(
    `insert into favorites (user_id, record_key, video_id, added_at)
     select $1, record_key, video_id, now() - (row_number() over (order by video_id) || ' seconds')::interval
       from (select distinct on (video_id) record_key, video_id from record_videos where playable
              order by video_id, rand_key limit 60) r`,
    [pro],
  );
  await page.goto("/favorites");
  await expect(page.getByTestId("item-row")).toHaveCount(50);
  const links = page.locator(`a[href^="${WATCH_VIDEOS}"]`);
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveText("Open in YouTube (1–50)");
  await clickSettled(page.getByRole("button", { name: "Load more" }));
  await expect(page.getByTestId("item-row")).toHaveCount(60);
  await expect(links).toHaveCount(2);
  await expect(links.nth(1)).toHaveText("Open in YouTube (51–60)");
  await expect(page.getByTestId("youtube-links")).toContainText("temporary playlist");

  const all: string[] = [];
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
    const href = (await link.getAttribute("href")) ?? "";
    expect(href.startsWith(WATCH_VIDEOS)).toBe(true);
    const ids = href.slice(WATCH_VIDEOS.length).split(",");
    expect(ids.length).toBeLessThanOrEqual(50);
    all.push(...ids);
  }
  expect(new Set(all).size).toBe(60);
});
