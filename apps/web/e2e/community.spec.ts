// Community lists: trending (built from favorites only), the viewer's own comments, and
// comment moderation: blocking a commenter, the published rules and contact point, and
// failures that are shown instead of hidden.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { clickSettled, expectCompliantPlayer, signIn, sql } from "./helpers";
import { stubYouTube } from "./youtube-stub";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

const token = () => randomUUID().slice(0, 8);

async function playableRecord(offset = 0): Promise<string> {
  const [rv] = await sql<{ record_key: string }>(
    "select record_key from record_videos where playable order by record_key limit 1 offset $1",
    [offset],
  );
  return rv?.record_key as string;
}

/** Someone else with a display name and a comment on the record, written straight to the database. */
async function otherCommenter(recordKey: string, body: string) {
  const userId = randomUUID();
  const name = `Commenter ${token()}`;
  await sql("insert into profiles (user_id, display_name) values ($1, $2)", [userId, name]);
  await sql("insert into comments (record_key, user_id, body) values ($1, $2, $3)", [
    recordKey,
    userId,
    body,
  ]);
  return { userId, name };
}

const recordPath = (key: string) => `/records/${encodeURIComponent(key)}`;

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

const SLOW_DOWN = "Slow down a little and try again shortly.";
const rateLimited = {
  status: 429,
  json: { error: { code: "rate_limited", message: SLOW_DOWN } },
};
const serverError = {
  status: 500,
  json: { error: { code: "internal", message: "Something went wrong." } },
};

test("your comments: a failed load or delete is shown, and the list waits for the server", async ({
  page,
}) => {
  await signIn(page);
  const key = await playableRecord();
  const t = token();
  expect(
    (await page.request.put("/api/v1/me/profile", { data: { displayName: `Lister ${t}` } })).ok(),
  ).toBe(true);
  const posted = await page.request.post(`/api/v1/records/${encodeURIComponent(key)}/comments`, {
    data: { body: `Kept ${t}` },
  });
  expect(posted.status()).toBe(201);

  let failLoad = true;
  await page.route("**/api/v1/me/comments", (route) =>
    failLoad ? route.fulfill(serverError) : route.fallback(),
  );
  await page.goto("/comments");
  const list = page.getByTestId("my-comments");
  await expect(list).toContainText("Couldn't load your comments.");
  await expect(list).not.toContainText("No comments yet");
  failLoad = false;
  await clickSettled(list.getByRole("button", { name: "Try again" }));
  await expect(list).toContainText(`Kept ${t}`);

  await page.route("**/api/v1/comments/*", (route) => route.fulfill(rateLimited));
  await clickSettled(list.getByRole("button", { name: "Delete comment" }));
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(SLOW_DOWN);
  await expect(list).toContainText(`Kept ${t}`);

  await page.unroute("**/api/v1/comments/*");
  await clickSettled(list.getByRole("button", { name: "Delete comment" }));
  await expect(list).toContainText("No comments yet");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("record comments: a failed load, delete or report is shown, not taken as done", async ({
  page,
}, info) => {
  await signIn(page);
  const key = await playableRecord(info.project.name === "desktop" ? 1 : 2);
  const t = token();
  await otherCommenter(key, `Reportable ${t}`);
  expect(
    (await page.request.put("/api/v1/me/profile", { data: { displayName: `Reporter ${t}` } })).ok(),
  ).toBe(true);
  const posted = await page.request.post(`/api/v1/records/${encodeURIComponent(key)}/comments`, {
    data: { body: `Mine ${t}` },
  });
  expect(posted.status()).toBe(201);

  // A failed load offers a retry instead of reading as "No comments yet".
  let failLoad = true;
  await page.route("**/api/v1/records/*/comments", (route) =>
    failLoad && route.request().method() === "GET" ? route.fulfill(serverError) : route.fallback(),
  );
  await page.goto(recordPath(key));
  const comments = page.getByTestId("comments");
  await expect(comments).toContainText("Couldn't load comments.");
  await expect(comments).not.toContainText("No comments yet");
  failLoad = false;
  await clickSettled(comments.getByRole("button", { name: "Try again" }));
  const own = comments.getByRole("listitem").filter({ hasText: `Mine ${t}` });
  const theirs = comments.getByRole("listitem").filter({ hasText: `Reportable ${t}` });
  await expect(own).toBeVisible();
  await expect(theirs).toBeVisible();

  // Delete and report fail: both comments stay as they were, with the server's reason.
  await page.route("**/api/v1/comments/**", (route) => route.fulfill(rateLimited));
  await clickSettled(own.getByRole("button", { name: "Delete comment" }));
  await expect(comments.getByRole("alert")).toHaveText(SLOW_DOWN);
  await expect(own).toBeVisible();
  const flag = theirs.getByRole("button", { name: "Report comment" });
  await clickSettled(flag);
  await expect(comments.getByRole("alert")).toHaveText(SLOW_DOWN);
  await expect(flag).toBeEnabled();
  await expect(flag).toHaveAttribute("title", "Report");

  await page.unroute("**/api/v1/comments/**");
  await clickSettled(flag);
  await expect(comments.getByRole("status")).toHaveText("Reported. Thanks for flagging it.");
  await expect(flag).toBeDisabled();
  await expect(flag).toHaveAttribute("title", "Reported");
  await clickSettled(own.getByRole("button", { name: "Delete comment" }));
  await expect(own).toHaveCount(0);
  await expect(comments.getByRole("alert")).toHaveCount(0);
});

test("block a commenter on a record, then unblock them from Account", async ({ page }, info) => {
  const viewer = await signIn(page);
  const key = await playableRecord(info.project.name === "desktop" ? 3 : 4);
  const t = token();
  const rude = await otherCommenter(key, `Rude remark ${t}`);
  await otherCommenter(key, `Lovely pressing ${t}`);

  await page.goto(recordPath(key));
  const comments = page.getByTestId("comments");
  const item = comments.getByRole("listitem").filter({ hasText: `Rude remark ${t}` });
  await expect(item).toContainText(rude.name);

  // Blocking asks first, inline; Cancel leaves everything as it was.
  await clickSettled(item.getByRole("button", { name: "Block commenter" }));
  const confirm = item.getByTestId("block-confirm");
  await expect(confirm).toContainText(`Block ${rude.name}?`);
  await clickSettled(confirm.getByRole("button", { name: "Cancel" }));
  await expect(confirm).toHaveCount(0);
  await clickSettled(item.getByRole("button", { name: "Block commenter" }));
  await clickSettled(confirm.getByRole("button", { name: "Block", exact: true }));
  await expect(item).toHaveCount(0);
  await expect(comments.getByRole("status")).toContainText(`Blocked ${rude.name}`);
  await expect(comments).toContainText(`Lovely pressing ${t}`);
  expect(
    await sql("select 1 from user_blocks where blocker_id = $1 and blocked_id = $2", [
      viewer,
      rude.userId,
    ]),
  ).toHaveLength(1);

  // Still gone after a reload. The block list names the commenter, never their user ID.
  await page.reload();
  await expect(comments).toContainText(`Lovely pressing ${t}`);
  await expect(comments).not.toContainText(`Rude remark ${t}`);
  const listed = await (await page.request.get("/api/v1/me/blocks")).text();
  expect(listed).toContain(rude.name);
  expect(listed).not.toContain(rude.userId);

  await page.goto("/account");
  const blocked = page.getByTestId("blocked-commenters");
  await expect(blocked).toContainText(rude.name);
  await clickSettled(blocked.getByRole("button", { name: `Unblock ${rude.name}` }));
  await expect(blocked).toContainText("You haven't blocked anyone.");
  expect(await sql("select 1 from user_blocks where blocker_id = $1", [viewer])).toEqual([]);

  await page.goto(recordPath(key));
  await expect(comments).toContainText(`Rude remark ${t}`);
});

test("the rules for what you post and a contact point are published", async ({ page }) => {
  await page.goto("/legal/terms");
  const terms = page.locator("article");
  await expect(terms.getByRole("heading", { name: "What you post" })).toBeVisible();
  await expect(terms).toContainText(
    "Pro sells tools such as crates, keyword and channel filters, share links and exports, never access to playback.",
  );
  await expect(terms).toContainText("favorites, saved filters, notes, comments");
  await expect(terms.locator('a[href^="mailto:"]').first()).toHaveAttribute(
    "href",
    /^mailto:[^@\s]+@[^@\s]+$/,
  );
  await expect(page.getByTestId("footer-contact").locator('a[href^="mailto:"]')).toBeVisible();

  await page.goto("/legal/privacy");
  await expect(page.locator('article a[href^="mailto:"]')).toHaveCount(1);
});
