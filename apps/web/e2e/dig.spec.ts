// End to end: shuffle, play, favorites, crates, history, saved filters, comments, and the
// Free/Pro split.

import { expect, type Page, test } from "@playwright/test";
import { settle, signIn, sql } from "./helpers";
import { stubYouTube, ytCalls } from "./youtube-stub";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

test("signed out: a record arrives with its Discogs link and generated sleeve", async ({
  page,
}) => {
  await page.goto("/");
  const panel = page.getByTestId("record-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: /View on Discogs/ })).toHaveAttribute(
    "href",
    /^https:\/\/www\.discogs\.com\/(master|release)\/\d+$/,
  );
  await expect(panel.getByRole("img", { name: "Generated sleeve" })).toBeVisible();
  await expect(page.locator('img[src*="discogs"]')).toHaveCount(0);
});

test("Pro: shuffle, play, save to a new crate, and find it in Crates", async ({ page }) => {
  await signIn(page, { pro: true });
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await page.getByTestId("shuffle").click();
  await expect.poll(async () => (await ytCalls(page)).at(-1)?.fn).toBe("loadVideoById");
  const title = await page.getByTestId("record-panel").locator("h2").innerText();

  await page.getByTestId("save").click();
  await page.getByLabel("New crate name").fill("Sunday digging");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("status")).toContainText("Saved to Sunday digging");

  await page.goto("/crates");
  await page.getByRole("link", { name: /Sunday digging/ }).click();
  await expect(page.getByTestId("item-row")).toHaveCount(1);
  await expect(page.getByTestId("item-row").first()).toContainText(title);
});

test("a play is logged after 5 seconds and shows in history", async ({ page }) => {
  await page.clock.install();
  const userId = await signIn(page);
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await page.getByTestId("shuffle").click();
  await expect.poll(async () => (await ytCalls(page)).at(-1)?.fn).toBe("loadVideoById");
  const logged = page.waitForRequest(
    (r) => r.url().endsWith("/api/v1/plays") && r.method() === "POST",
  );
  await page.clock.runFor(6_000);
  expect((await logged).postDataJSON()).toMatchObject({ seconds: 5 });
  await expect
    .poll(async () => (await sql("select 1 from history where user_id = $1", [userId])).length)
    .toBe(1);
  await page.goto("/history");
  await expect(page.getByTestId("item-row")).toHaveCount(1);
});

async function openFilters(page: Page, project: string) {
  if (project !== "desktop") await page.getByRole("button", { name: "Filters" }).click();
}

test("Free: the heart and F keep favorites; crates are a Pro tool", async ({ page }) => {
  const userId = await signIn(page);
  const favorites = async () =>
    (await sql("select 1 from favorites where user_id = $1", [userId])).length;
  await page.goto("/");
  const heart = page.getByTestId("favorite");
  await expect(heart).toBeEnabled();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect.poll(favorites).toBe(1);
  await page.keyboard.press("f");
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect.poll(favorites).toBe(0);

  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-panel")).toContainText("Crates are a Pro tool");
  const crate = await page.request.post("/api/v1/crates", { data: { name: "One" } });
  expect(crate.status()).toBe(403);
  expect((await crate.json()).error.code).toBe("pro_required");
});

test("signed out: favorites ask for a sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("favorite")).toBeEnabled();
  await page.getByTestId("favorite").click();
  await expect(page.getByRole("status").first()).toContainText("Sign in to keep favorites");
  expect((await page.request.post("/api/v1/favorites", { data: {} })).status()).toBe(401);
});

test("Free: tempo, key and views are free; keyword, topic and more-from are Pro", async ({
  page,
}, info) => {
  await signIn(page);
  for (const q of ["bpm_from=60&bpm_to=200", "key=8A&compatible=1", "max_views=40000"]) {
    expect((await page.request.get(`/api/v1/shuffle?${q}`)).status(), q).toBe(200);
  }
  for (const q of ["q=night", "topic=1", "channel=UCe2eChannel000000000001"]) {
    const res = await page.request.get(`/api/v1/shuffle?${q}`);
    expect(res.status(), q).toBe(403);
    expect((await res.json()).error.code).toBe("pro_required");
  }

  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await openFilters(page, info.project.name);
  await expect(page.getByLabel("BPM from")).toBeEnabled();
  const proGroup = page.getByRole("group", { name: "Pro filters" });
  await expect(proGroup.getByLabel("Keywords")).toBeDisabled();
  await expect(proGroup.getByLabel(/Topic channels only/)).toBeDisabled();
  const moreFrom = page.getByTestId("more-from");
  await expect(moreFrom.getByRole("button").first()).toBeDisabled();
  await expect(moreFrom.getByRole("link", { name: "Go Pro" })).toBeVisible();
});

test("Pro: keyword search, topic channels and more from this channel", async ({ page }) => {
  await signIn(page, { pro: true });
  const pickFor = async (q: string) => {
    const res = await page.request.get(`/api/v1/shuffle?${q}`);
    expect(res.status(), q).toBe(200);
    return (await res.json()).pick;
  };
  expect(await pickFor("q=night")).not.toBeNull();
  expect(await pickFor("q=zzqqxxnomatch")).toBeNull();
  expect((await pickFor("topic=1"))?.channel).toMatchObject({ topic: true });
  expect((await pickFor("channel=UCe2eChannel000000000002"))?.channel?.id).toBe(
    "UCe2eChannel000000000002",
  );

  await page.goto("/");
  const moreFrom = page.getByTestId("more-from");
  await moreFrom.getByRole("button", { name: /this release/ }).click();
  await expect(page.getByTestId("scope-chips")).toContainText("This release");
});

test("Free: save, reload and apply a filter preset; Pro presets stay locked", async ({
  page,
}, info) => {
  const userId = await signIn(page);
  await sql(
    "insert into saved_filters (user_id, name, filters) values ($1, 'Keyword preset', $2)",
    [userId, JSON.stringify({ q: "night" })],
  );
  await page.goto("/");
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await openFilters(page, info.project.name);
  const list = page.getByTestId("saved-filters");
  await expect(list).toContainText("Keyword preset");
  await page.getByLabel("BPM from").fill("90");
  await page.getByLabel("Saved filter name").fill("Mid tempo");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(list).toContainText("Mid tempo");
  await expect
    .poll(
      async () => (await sql("select 1 from saved_filters where user_id = $1", [userId])).length,
    )
    .toBe(2);

  await page.reload();
  await openFilters(page, info.project.name);
  await expect(list).toContainText("Mid tempo");
  await page.getByLabel("BPM from").fill("");
  await list.getByRole("button", { name: "Mid tempo", exact: true }).click();
  await expect(page.getByLabel("BPM from")).toHaveValue("90");
  await list.getByRole("button", { name: "Keyword preset", exact: true }).click();
  await expect(page.getByTestId("filter-drawer")).toContainText("That preset uses Pro filters.");
});

test("comments: pick a display name, post, see the rank, delete", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  const comments = page.getByTestId("comments");
  await expect(comments).toBeVisible();
  const name = `Digger ${Date.now().toString(36)}`;
  await comments.getByLabel("Display name").fill(name);
  await comments.getByRole("button", { name: "Save name" }).click();
  await comments.getByLabel("Comment").fill("Break at 1:12, sampled everywhere.");
  await comments.getByRole("button", { name: "Post" }).click();
  const item = comments.getByRole("listitem").filter({ hasText: "Break at 1:12" });
  await expect(item).toContainText(name);
  await expect(item).toContainText("Newcomer");
  await item.getByRole("button", { name: "Delete comment" }).click();
  await expect(item).toHaveCount(0);
});

test("account deletion removes the user's rows", async ({ page }) => {
  const userId = await signIn(page);
  const [rv] = await sql<{ record_key: string; video_id: string }>(
    "select record_key, video_id from record_videos where playable limit 1",
  );
  await page.request.post("/api/v1/favorites", {
    data: { recordKey: rv?.record_key, videoId: rv?.video_id },
  });
  await page.request.post("/api/v1/saved-filters", {
    data: { name: "Doomed", filters: { bpmFrom: 90 } },
  });
  await page.goto("/account");
  await page.getByLabel("Confirm deletion").fill("delete");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL("/");
  for (const table of ["favorites", "saved_filters"]) {
    expect(await sql(`select 1 from ${table} where user_id = $1`, [userId])).toEqual([]);
  }
});

test("player settings: random start, hide comments, kept on this device", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("comments")).toBeVisible();
  const settings = page.getByTestId("player-settings");
  await settings.getByText("Player settings").click();
  await settings.getByLabel("Start at").selectOption("random");
  await settle(settings.getByLabel("Hide comments"));
  await settings.getByLabel("Hide comments").check();
  await expect(page.getByTestId("comments")).toHaveCount(0);

  // Loaded or only cued, depending on how much of the player is in view on this screen.
  const before = (await ytCalls(page)).length;
  await page.getByTestId("shuffle").click();
  await expect.poll(async () => (await ytCalls(page)).length).toBeGreaterThan(before);
  const start = (await ytCalls(page)).at(-1)?.startSeconds ?? -1;
  expect(start).toBeGreaterThanOrEqual(10);
  expect(start).toBeLessThanOrEqual(75);

  await page.reload();
  await expect(page.getByTestId("record-panel")).toBeVisible();
  await expect(page.getByTestId("comments")).toHaveCount(0);
  await page.getByTestId("player-settings").getByText("Player settings").click();
  await expect(page.getByTestId("player-settings").getByLabel("Start at")).toHaveValue("random");
});
