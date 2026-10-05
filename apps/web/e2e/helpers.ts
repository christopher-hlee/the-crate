import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import pg from "pg";

export function e2eDb(): pg.Client {
  const u = new URL(
    process.env.TEST_DATABASE_URL ?? "postgres://crate:crate@localhost:5433/postgres",
  );
  u.pathname = `/${process.env.E2E_DB_NAME ?? "crate_e2e"}`;
  return new pg.Client({ connectionString: u.toString() });
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const c = e2eDb();
  await c.connect();
  try {
    return (await c.query<T>(text, values)).rows;
  } finally {
    await c.end();
  }
}

/** Signs the page in as a fresh dev user (AUTH_MODE=dev only) and returns the user ID. */
export async function signIn(page: Page, opts: { pro?: boolean } = {}): Promise<string> {
  const userId = randomUUID();
  const res = await page.request.post("/api/dev/session", { data: { userId } });
  expect(res.ok()).toBe(true);
  if (opts.pro) {
    await sql("insert into subscriptions (user_id, plan, source) values ($1, 'pro', 'stripe')", [
      userId,
    ]);
  }
  return userId;
}

export type PlayerAudit = {
  frames: number;
  box: { width: number; height: number } | null;
  covered: string[];
  blocked: string[];
};

/** Compliance tests 1–3: one YouTube iframe, nothing over it, nothing disabling it, size. */
export async function auditPlayer(page: Page): Promise<PlayerAudit> {
  const frames = page.locator('iframe[src^="https://www.youtube.com/embed/"]');
  await expect(frames.first()).toBeVisible();
  await frames.first().scrollIntoViewIfNeeded();
  const count = await page
    .locator("iframe")
    .evaluateAll(
      (els) =>
        els.filter((e) => /youtube(-nocookie)?\.com\/embed\//.test((e as HTMLIFrameElement).src))
          .length,
    );
  const result = await frames.first().evaluate((iframe) => {
    const r = iframe.getBoundingClientRect();
    const covered: string[] = [];
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        const x = r.left + (r.width * i) / 10;
        const y = r.top + (r.height * j) / 10;
        const hit = document.elementFromPoint(x, y);
        if (hit !== iframe)
          covered.push(
            `${Math.round(x)},${Math.round(y)} → ${hit ? `${hit.tagName}.${hit.className}` : "nothing"}`,
          );
      }
    }
    const blocked: string[] = [];
    for (let n: Element | null = iframe; n; n = n.parentElement) {
      if (n.hasAttribute("inert")) blocked.push(`${n.tagName} is inert`);
      if (getComputedStyle(n).pointerEvents === "none")
        blocked.push(`${n.tagName} has pointer-events: none`);
      if (getComputedStyle(n).visibility === "hidden") blocked.push(`${n.tagName} is hidden`);
    }
    return { box: { width: r.width, height: r.height }, covered, blocked };
  });
  return { frames: count, ...result };
}

export async function expectCompliantPlayer(page: Page, min = { width: 200, height: 200 }) {
  const a = await auditPlayer(page);
  expect(a.frames, "exactly one YouTube iframe on the screen").toBe(1);
  expect(a.covered, "nothing drawn over the player").toEqual([]);
  expect(a.blocked, "no inert or pointer-events: none on the player or its ancestors").toEqual([]);
  expect(a.box?.width ?? 0).toBeGreaterThanOrEqual(min.width);
  expect(a.box?.height ?? 0).toBeGreaterThanOrEqual(min.height);
}

/**
 * Scrolls a control into view and waits two frames before clicking. Chromium routes a click
 * sent straight after a scroll by the old layout, so it can land on the cross-origin player
 * iframe instead; people never click that fast after scrolling.
 */
export async function settle(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator
    .page()
    .evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

export async function clickSettled(locator: Locator): Promise<void> {
  await settle(locator);
  await locator.click();
}
