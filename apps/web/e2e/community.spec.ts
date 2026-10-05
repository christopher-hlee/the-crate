// Community lists: trending (built from favorites only) and the viewer's own comments.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectCompliantPlayer, signIn, sql } from "./helpers";
import { stubYouTube } from "./youtube-stub";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

test("trending lists records several people favorited, free to play", async ({ page }, info) => {
  const picks = await sql<{ record_key: string; video_id: string }>(
    "select record_key, video_id from record_videos where playable order by rand_key desc limit 2 offset $1",
    [info.project.name === "desktop" ? 0 : 2],
  );
  const [hot, warm] = picks;
  for (const [ref, n] of [
    [hot, 3],
    [warm, 2],
  ] as const) {
    for (let i = 0; i < n; i++) {
      await sql("insert into favorites (user_id, record_key, video_id) values ($1, $2, $3)", [
        randomUUID(),
        ref?.record_key,
        ref?.video_id,
      ]);
    }
  }
  await sql("delete from pick_cache where key like 'trending:%'");
  const body = await (await page.request.get("/api/v1/trending")).json();
  const items: { videoId: string; fans: number }[] = body.items;
  const at = (videoId?: string) => items.findIndex((i) => i.videoId === videoId);
  expect(items[at(hot?.video_id)]?.fans).toBe(3);
  expect(items[at(warm?.video_id)]?.fans).toBe(2);
  expect(at(hot?.video_id)).toBeLessThan(at(warm?.video_id));

  await page.goto("/trending");
  await expect(page.getByTestId("item-row").first()).toBeVisible();
  await expect(
    page
      .getByTestId("fans")
      .filter({ hasText: /^3 fans$/ })
      .first(),
  ).toBeVisible();
  await expectCompliantPlayer(
    page,
    info.project.name === "desktop" ? { width: 480, height: 270 } : { width: 200, height: 200 },
  );
});

test("your comments lists what you wrote, with links to the records", async ({ page }) => {
  await signIn(page);
  const [rv] = await sql<{ record_key: string }>(
    "select record_key from record_videos where playable limit 1",
  );
  const key = rv?.record_key as string;
  expect(
    (
      await page.request.put("/api/v1/me/profile", {
        data: { displayName: `Lister ${Date.now().toString(36)}` },
      })
    ).ok(),
  ).toBe(true);
  const posted = await page.request.post(`/api/v1/records/${encodeURIComponent(key)}/comments`, {
    data: { body: "Drums at the top" },
  });
  expect(posted.status()).toBe(201);
  await page.goto("/comments");
  const list = page.getByTestId("my-comments");
  await expect(list).toContainText("Drums at the top");
  await expect(list.getByRole("link").first()).toHaveAttribute(
    "href",
    `/records/${encodeURIComponent(key)}`,
  );
  await list.getByRole("button", { name: "Delete comment" }).click();
  await expect(list).toContainText("No comments yet");
});
