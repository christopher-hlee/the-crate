// The compliance tests from docs/SPEC.md "Engineering conventions" that need a browser.
// Any failure fails CI.

import { expect, test } from "@playwright/test";
import { expectCompliantPlayer, signIn, sql } from "./helpers";
import { stubYouTube, ytCalls } from "./youtube-stub";

const desktopMin = { width: 480, height: 270 };
const phoneMin = { width: 200, height: 200 };

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

function minFor(projectName: string) {
  return projectName === "desktop" ? desktopMin : phoneMin;
}

test("Dig screen: one compliant player, before and after interaction", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await expectCompliantPlayer(page, minFor(info.project.name));

  await page.getByTestId("shuffle").click();
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-panel")).toBeVisible();
  if (info.project.name !== "desktop") await page.getByRole("button", { name: "Filters" }).click();
  await expectCompliantPlayer(page, minFor(info.project.name));
});

test("record page: one compliant player", async ({ page }, info) => {
  await page.goto("/records/m:7001");
  await expectCompliantPlayer(page, minFor(info.project.name));
});

test("crate, shared crate and history screens: one compliant player each", async ({
  page,
}, info) => {
  const userId = await signIn(page, { pro: true });
  const items = await sql<{ record_key: string; video_id: string }>(
    "select record_key, video_id from record_videos where playable order by rand_key limit 3",
  );
  const [crate] = await sql<{ id: string }>(
    "insert into crates (user_id, name, share_id) values ($1, 'Audit', $2) returning id",
    [userId, `share${userId.slice(0, 8)}`],
  );
  for (const [i, it] of items.entries()) {
    await sql(
      "insert into crate_items (crate_id, record_key, video_id, position) values ($1, $2, $3, $4)",
      [crate?.id, it.record_key, it.video_id, i],
    );
    await sql(
      "insert into history (user_id, played_at, record_key, video_id) values ($1, now() - ($2 || ' minutes')::interval, $3, $4)",
      [userId, String(i), it.record_key, it.video_id],
    );
  }
  for (const path of [`/crates/${crate?.id}`, `/shared/share${userId.slice(0, 8)}`, "/history"]) {
    await page.goto(path);
    await expect(page.getByTestId("item-row").first()).toBeVisible();
    await expectCompliantPlayer(page, minFor(info.project.name));
  }
});

test("player uses only documented parameters and loads the IFrame API once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId("shuffle").click();
  const calls = await ytCalls(page);
  const created = calls.filter((c) => c.fn === "new");
  expect(created).toHaveLength(1);
  expect(Object.keys(created[0]?.playerVars ?? {}).sort()).toEqual([
    "controls",
    "origin",
    "playsinline",
    "rel",
  ]);
  expect(created[0]?.playerVars).toMatchObject({ playsinline: 1, controls: 1, rel: 0 });
  const scripts = await page.locator('script[src="https://www.youtube.com/iframe_api"]').count();
  expect(scripts).toBe(1);
});

test("first pick is cued, not autoplayed; a click plays; out of view never autoplays", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "scroll geometry is checked on desktop");
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await expect
    .poll(async () => (await ytCalls(page)).filter((c) => c.fn !== "new")[0]?.fn)
    .toBe("cueVideoById");

  await page.getByTestId("shuffle").click();
  await expect.poll(async () => (await ytCalls(page)).at(-1)?.fn).toBe("loadVideoById");

  // Scroll the player mostly out of view, then ask for the next pick with the N key.
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  // Wait until the player itself knows it is under half visible.
  await expect(page.locator("[data-player-box]")).toHaveAttribute("data-visible", /^0\.([0-4]\d|50)$/);
  await page.keyboard.press("n");
  await expect.poll(async () => (await ytCalls(page)).at(-1)?.fn).toBe("cueVideoById");
});

test("an unplayable video is reported and skipped", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await page.getByTestId("shuffle").click();
  await expect.poll(async () => (await ytCalls(page)).at(-1)?.fn).toBe("loadVideoById");
  const before = (await ytCalls(page)).at(-1)?.videoId;
  const report = page.waitForRequest(
    (r) => r.url().includes(`/api/v1/videos/${before}/report`) && r.method() === "POST",
  );
  await page.evaluate(() =>
    (
      window as unknown as { __yt: { players: { __error(c: number): void }[] } }
    ).__yt.players[0]?.__error(150),
  );
  expect((await report).postDataJSON()).toEqual({ code: 150 });
  await expect.poll(async () => (await ytCalls(page)).at(-1)?.videoId).not.toBe(before);
  await expect(page.getByRole("status")).toContainText("skipped");
});
