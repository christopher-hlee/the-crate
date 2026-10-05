// Accounts: display names and ranks, the header when signed in and out, sign-in links that
// come back to the page, sign out, and robots.txt and the sitemaps.

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn, sql } from "./helpers";
import { stubYouTube } from "./youtube-stub";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

const uniqueName = () => `Digger ${randomUUID().slice(0, 8)}`;

test("set a display name and see it on Account, with the rank and plan copy", async ({ page }) => {
  await signIn(page);
  await page.goto("/account");
  await expect(page.getByTestId("rank")).toHaveText("Newcomer");
  await expect(page.getByTestId("display-name")).toHaveCount(0);
  // Dev sign-in has no password, so no "Change password" link.
  await expect(page.getByRole("link", { name: "Change password" })).toHaveCount(0);
  await expect(page.getByTestId("plan-free")).toContainText("Favorites (up to 10,000)");
  await expect(page.getByTestId("plan-free")).toContainText("50-play history");
  await expect(page.getByTestId("plan-pro")).toContainText("Crates (200 × 1,000 records)");
  await expect(page.getByTestId("plan-pro")).toContainText("No ads");

  const input = page.getByLabel("Display name");
  await input.fill("ab");
  await expect(page.getByText(/Use 3 to 30 letters/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled();

  const name = uniqueName();
  await input.fill(name);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByTestId("display-name")).toHaveText(name);

  await page.reload();
  await expect(page.getByTestId("display-name")).toHaveText(name);
  await expect(page.getByLabel("Display name")).toHaveValue(name);
});

test("a second user can't take a name that's in use (409)", async ({ page }) => {
  await signIn(page);
  const name = uniqueName();
  const first = await page.request.put("/api/v1/me/profile", { data: { displayName: name } });
  expect(first.status()).toBe(200);

  await signIn(page); // a different user in the same browser
  const taken = await page.request.put("/api/v1/me/profile", {
    data: { displayName: name.toUpperCase() },
  });
  expect(taken.status()).toBe(409);
  expect((await taken.json()).error.message).toBe("That name is taken.");

  await page.goto("/account");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("That name is taken.")).toBeVisible();
  await expect(page.getByTestId("display-name")).toHaveCount(0);
});

test("the header: sign-in links carry next=; signed in adds Favorites, For you and Sign out", async ({
  page,
}) => {
  await page.goto("/history");
  const header = page.getByRole("banner");
  const signInLink = header.getByRole("link", { name: "Sign in" });
  await expect(signInLink).toHaveAttribute("href", "/login?next=%2Fhistory");
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fhistory",
  );
  await expect(header.getByRole("link", { name: "Favorites" })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  // Never sticky or fixed: it must not slide over the player (rule 3).
  expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe("static");

  // The dev sign-in honours next and comes back to the page.
  await signInLink.click();
  await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
  await page.getByTestId("dev-login").click();
  await expect(page).toHaveURL(/\/history$/);

  await expect(header.getByRole("link", { name: "Favorites" })).toHaveAttribute(
    "href",
    "/favorites",
  );
  await expect(header.getByRole("link", { name: "For you" })).toHaveAttribute("href", "/for-you");
  await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
  for (const label of ["Dig", "Daily", "Crates", "History", "Changelog"]) {
    await expect(header.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe("static");
});

test("unsafe next values fall back to the home page", async ({ page }) => {
  await page.goto("/login?next=%2F%2Fevil.example%2F");
  await page.getByTestId("dev-login").click();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
});

test("sign out from the header", async ({ page }) => {
  await signIn(page);
  await page.goto("/account");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: /Account/ })).toBeVisible();
  await header.getByRole("button", { name: "Sign out" }).click();
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login?next=%2Faccount",
  );
  await expect(header.getByRole("link", { name: "Favorites" })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});

test("password page explains that dev sign-in has no password", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/password");
  await expect(page.getByText(/Passwords need Supabase/)).toBeVisible();
});

test("robots.txt and the sitemap respond, with record pages and no YouTube data", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const lines = (await robots.text()).split("\n").map((l) => l.trim());
  for (const path of ["/", "/records/", "/daily", "/changelog", "/legal"]) {
    expect(lines).toContain(`Allow: ${path}`);
  }
  for (const path of ["/api", "/account", "/login", "/crates", "/favorites", "/history"]) {
    expect(lines).toContain(`Disallow: ${path}`);
  }
  expect(lines).toContain("Disallow: /for-you");
  const sitemaps = lines.filter((l) => l.startsWith("Sitemap: ")).map((l) => l.slice(9));
  expect(sitemaps[0]).toMatch(/^https?:\/\/[^/]+\/sitemap\/0\.xml$/);

  const res = await request.get(new URL(sitemaps[0] as string).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] as string);
  expect(locs.length).toBeLessThanOrEqual(50_000);
  expect(locs.some((l) => l.endsWith("/daily"))).toBe(true);
  const records = locs.filter((l) => /\/records\/[mr]%3A\d+$/.test(l));
  expect(records.length).toBeGreaterThan(0);
  expect(xml).not.toMatch(/youtube|youtu\.be|ytimg|<image:|<video:/i);

  // A listed record is a real, playable one, and its page opens.
  const key = decodeURIComponent((records[0] as string).split("/records/")[1] as string);
  const playable = await sql("select 1 from record_videos where record_key = $1 and playable", [
    key,
  ]);
  expect(playable.length).toBeGreaterThan(0);
  expect((await request.get(new URL(records[0] as string).pathname)).status()).toBe(200);
  expect((await request.get("/sitemap/999.xml")).status()).toBe(404);
});
