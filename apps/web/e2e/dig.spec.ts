// End to end: shuffle, play, save to crate, history, plan limits and Pro gating.

import { expect, test } from "@playwright/test";
import { signIn, sql } from "./helpers";
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

test("shuffle, play, save to a new crate, and find it in Crates", async ({ page }) => {
  await signIn(page);
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

test("Free accounts keep 3 crates; Pro filters are locked and refused by the API", async ({
  page,
}, info) => {
  await signIn(page);
  for (const name of ["One", "Two", "Three"]) {
    expect((await page.request.post("/api/v1/crates", { data: { name } })).status()).toBe(201);
  }
  const fourth = await page.request.post("/api/v1/crates", { data: { name: "Four" } });
  expect(fourth.status()).toBe(403);
  expect((await fourth.json()).error.code).toBe("limit_reached");

  const pro = await page.request.get("/api/v1/shuffle?bpm_from=120&bpm_to=125");
  expect(pro.status()).toBe(403);
  expect((await pro.json()).error.code).toBe("pro_required");

  await page.goto("/");
  if (info.project.name !== "desktop") await page.getByRole("button", { name: "Filters" }).click();
  const proGroup = page.getByRole("group", { name: "Pro filters" });
  await expect(proGroup.getByRole("spinbutton").first()).toBeDisabled();
  await expect(proGroup.getByRole("combobox")).toBeDisabled();
});

test("account deletion removes the user's rows", async ({ page }) => {
  const userId = await signIn(page);
  await page.request.post("/api/v1/crates", { data: { name: "Doomed" } });
  await page.goto("/account");
  await page.getByLabel("Confirm deletion").fill("delete");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL("/");
  expect(await sql("select 1 from crates where user_id = $1", [userId])).toEqual([]);
});
