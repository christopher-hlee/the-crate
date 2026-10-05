// Lists: For you, history clearing, crates on Free and Pro, crate item notes, unsharing on any
// plan, and a shared crate's seeded order (tabs, never a second player).

import { expect, test } from "@playwright/test";
import { expectCompliantPlayer, signIn, sql } from "./helpers";
import { stubYouTube } from "./youtube-stub";

test.beforeEach(async ({ page }) => {
  await stubYouTube(page);
});

function minFor(projectName: string) {
  return projectName === "desktop" ? { width: 480, height: 270 } : { width: 200, height: 200 };
}

type Ref = { record_key: string; video_id: string };

function playable(n: number, offset: number): Promise<Ref[]> {
  return sql<Ref>(
    "select record_key, video_id from record_videos where playable order by rand_key limit $1 offset $2",
    [n, offset],
  );
}

async function crateFor(
  userId: string,
  items: Ref[],
  opts: { shareId?: string; seed?: number; filters?: object } = {},
): Promise<string> {
  const [crate] = await sql<{ id: string }>(
    `insert into crates (user_id, name, share_id, seed, filters)
     values ($1, 'Lists crate', $2, $3, $4) returning id`,
    [
      userId,
      opts.shareId ?? null,
      opts.seed ?? null,
      opts.filters ? JSON.stringify(opts.filters) : null,
    ],
  );
  for (const [i, it] of items.entries()) {
    await sql(
      "insert into crate_items (crate_id, record_key, video_id, position) values ($1, $2, $3, $4)",
      [crate?.id, it.record_key, it.video_id, i],
    );
  }
  return crate?.id as string;
}

test("For you: an empty state first, then picks in the styles you favorite", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto("/for-you");
  await expect(page.getByTestId("for-you-empty")).toContainText(
    "Favorite a few records to get picks for you",
  );

  // Three records that share a style, so it leads the basis.
  const picks = await sql<Ref & { style: string }>(
    `with s as (
       select styles[1] as style from record_videos where playable and cardinality(styles) > 0
        group by 1 having count(*) >= 3 order by count(*) desc, 1 limit 1)
     select rv.record_key, rv.video_id, s.style from record_videos rv join s on rv.styles[1] = s.style
      where rv.playable order by rv.rand_key limit 3`,
  );
  expect(picks).toHaveLength(3);
  for (const p of picks) {
    const res = await page.request.post("/api/v1/favorites", {
      data: { recordKey: p.record_key, videoId: p.video_id },
    });
    expect(res.status()).toBe(201);
  }
  await page.reload();
  await expect(page.getByTestId("for-you-basis")).toContainText(
    `From your favorites and plays: ${picks[0]?.style}`,
  );
  await expect(page.getByTestId("item-row").first()).toBeVisible();
  await expect(
    page
      .getByTestId("item-row")
      .first()
      .getByRole("button", { name: /^Favorite/ }),
  ).toBeVisible();
  await expectCompliantPlayer(page, minFor(info.project.name));
});

test("history: hearts on rows, and Clear history after an inline confirm", async ({ page }) => {
  const userId = await signIn(page);
  for (const [i, it] of (await playable(3, 50)).entries()) {
    await sql(
      "insert into history (user_id, played_at, record_key, video_id) values ($1, now() - ($2 || ' minutes')::interval, $3, $4)",
      [userId, String(i), it.record_key, it.video_id],
    );
  }
  await page.goto("/history");
  const rows = page.getByTestId("item-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Favorite/ })).toHaveCount(3);

  await page.getByRole("button", { name: "Clear history" }).click();
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(rows).toHaveCount(3);
  await page.getByRole("button", { name: "Clear history" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("Nothing played yet")).toBeVisible();
  await expect(page.locator('iframe[src^="https://www.youtube.com/embed/"]')).toHaveCount(0);
  expect(await sql("select 1 from history where user_id = $1", [userId])).toEqual([]);
});

test("crates on Free: an upsell to favorites, and a lapsed Pro's crates stay playable", async ({
  page,
}) => {
  const userId = await signIn(page);
  await page.goto("/crates");
  const upsell = page.getByTestId("crates-upsell");
  await expect(upsell).toContainText(
    "Crates are a Pro tool. Favorites are free: heart any record.",
  );
  await expect(upsell.getByRole("link", { name: /Your favorites/ })).toHaveAttribute(
    "href",
    "/favorites",
  );
  await expect(upsell.getByRole("link", { name: /Go Pro/ })).toHaveAttribute("href", "/account");
  await expect(page.getByLabel("New crate name")).toHaveCount(0);

  const id = await crateFor(userId, await playable(2, 60));
  await page.reload();
  await page.getByRole("link", { name: /Lists crate/ }).click();
  await expect(page).toHaveURL(`/crates/${id}`);
  await expect(page.getByTestId("item-row")).toHaveCount(2);
  await expect(page.getByText("This crate stays playable on Free")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play all" })).toBeEnabled();
});

test("a Free owner can stop sharing; creating a share link stays Pro", async ({ page }) => {
  const userId = await signIn(page);
  const shareId = `stop${userId.slice(0, 8)}`;
  const id = await crateFor(userId, await playable(1, 70), { shareId });
  await page.goto(`/crates/${id}`);
  await expect(page.getByRole("link", { name: new RegExp(`/shared/${shareId}$`) })).toBeVisible();
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.getByRole("button", { name: "Stop sharing" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share link" })).toHaveCount(0);
  await expect(
    page.getByText("Share links and CSV or JSON crate sheets are Pro tools."),
  ).toBeVisible();
  expect(await sql("select share_id from crates where id = $1", [id])).toEqual([
    { share_id: null },
  ]);
});

test("Pro: crate count, an inline note on a crate item, and YouTube links", async ({
  page,
}, info) => {
  const userId = await signIn(page, { pro: true });
  const items = await playable(3, 80);
  const id = await crateFor(userId, items);
  await page.goto("/crates");
  await expect(page.getByTestId("crates-count")).toContainText("1 of 200");
  await expect(page.getByTestId("crates-upsell")).toHaveCount(0);
  await page.getByRole("link", { name: /Lists crate/ }).click();

  const rows = page.getByTestId("item-row");
  await expect(rows).toHaveCount(3);
  const note = rows.nth(1).getByRole("textbox", { name: /^Note on/ });
  await note.fill("Sample the horn stab");
  await note.blur();
  await expect(rows.nth(1)).toContainText("Saved");
  await expect
    .poll(
      async () =>
        (
          await sql<{ note: string | null }>(
            "select note from crate_items where crate_id = $1 and record_key = $2 and video_id = $3",
            [id, items[1]?.record_key, items[1]?.video_id],
          )
        )[0]?.note,
    )
    .toBe("Sample the horn stab");

  const link = page.locator('a[href^="https://www.youtube.com/watch_videos?video_ids="]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText("Open in YouTube (1–3)");
  await expectCompliantPlayer(page, minFor(info.project.name));
});

test("a shared seeded crate shows its seeded order in a tab, with one player", async ({
  page,
  browser,
}, info) => {
  const userId = await signIn(page, { pro: true });
  const shareId = `seq${userId.slice(0, 8)}`;
  await crateFor(userId, await playable(2, 90), {
    shareId,
    seed: 4321,
    filters: { genres: ["Electronic"] },
  });
  const seq = await (await page.request.get(`/api/v1/shared/${shareId}/sequence?page=0`)).json();
  expect(seq.items.length).toBeGreaterThan(0);

  const anon = await browser.newPage();
  await stubYouTube(anon);
  await anon.goto(`/shared/${shareId}`);
  await expect(anon.getByTestId("item-row")).toHaveCount(2);
  await expect(
    anon
      .getByTestId("item-row")
      .first()
      .getByRole("link", { name: /^Sign in to favorite/ }),
  ).toBeVisible();
  await anon.getByRole("tab", { name: "Seeded order" }).click();
  await expect(anon.getByTestId("sequence-coverage")).toBeVisible();
  await expect(anon.getByTestId("item-row")).toHaveCount(seq.items.length);
  await expect(anon.getByTestId("item-row").first()).toContainText(seq.items[0].record.title);
  await expectCompliantPlayer(anon, minFor(info.project.name));
  await anon.getByRole("tab", { name: "Saved records" }).click();
  await expect(anon.getByTestId("item-row")).toHaveCount(2);
  await expectCompliantPlayer(anon, minFor(info.project.name));
  await anon.close();
});
