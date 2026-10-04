// The archive (spec: cleared lane), on in e2e via FEATURE_CLEARED_LANE. Only recordings whose
// rights pass are listed or served; listening is free; WAV and DAW folder export are Pro.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { signIn, sql } from "./helpers";

test.skip(({ viewport }) => (viewport?.width ?? 0) < 600, "The archive specs run on desktop only");

const STOMP = "Example Jazz Band - Example Stomp [104 BPM 8B]";

async function assetId(slug: string): Promise<string> {
  const [row] = await sql<{ id: string }>("select id from assets where slug = $1", [slug]);
  if (!row) throw new Error(`No asset ${slug}`);
  return row.id;
}

async function seekTo(page: Page, seconds: number) {
  await page.getByTestId("archive-audio").evaluate(async (el, s) => {
    const audio = el as HTMLAudioElement;
    if (audio.readyState < 1)
      await new Promise((r) => audio.addEventListener("loadedmetadata", r, { once: true }));
    audio.currentTime = s;
    await new Promise((r) => audio.addEventListener("seeked", r, { once: true }));
  }, seconds);
}

test("lists only recordings whose rights pass, with their rights record", async ({ page }) => {
  await page.goto("/archive");
  const list = page.getByTestId("archive-list");
  await expect(list.getByText("Example Stomp")).toBeVisible();
  await expect(list.getByText("Free Waltz")).toBeVisible();
  await expect(list.getByText("Not Yet Public")).toHaveCount(0);
  await expect(list.getByText("Non-commercial")).toHaveCount(0);
  await expect(page.getByTestId("rights")).toContainText("US public domain");
  await expect(page.getByTestId("rights")).toContainText("Test discography entry");
  await list.getByText("Free Waltz").click();
  await expect(page.getByTestId("rights")).toContainText("Open Ensemble, CC BY 4.0");
  await expect(page.getByRole("link", { name: "Licence" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/4.0/",
  );
  // Unlisted: not in the nav, and not indexed.
  await expect(page.getByRole("navigation").getByText("Archive")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("serves previews with ranges, and never serves held, rejected or Free-tier masters", async ({
  page,
}) => {
  const stomp = await assetId("e2e-stomp");
  const held = await assetId("e2e-held");
  const asset = await (await page.request.get(`/api/v1/archive/${stomp}`)).json();
  const ranged = await page.request.get(asset.previewUrl, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);
  expect((await page.request.get(`/api/v1/archive/${held}`)).status()).toBe(404);
  expect(
    (await page.request.get(`/api/v1/archive/files/cleared/${held}/peaks.json`)).status(),
  ).toBe(404);
  expect(
    (await page.request.get(`/api/v1/archive/files/cleared/${stomp}/master.wav`)).status(),
  ).toBe(401);
  await signIn(page);
  expect(
    (await page.request.get(`/api/v1/archive/files/cleared/${stomp}/master.wav`)).status(),
  ).toBe(403);
  const dl = await page.request.get(`/api/v1/archive/${stomp}/download`);
  expect(dl.status()).toBe(403);
  expect((await dl.json()).error.code).toBe("pro_required");
});

test("plays, draws a waveform, and keeps chop markers for a signed-in user", async ({ page }) => {
  const userId = await signIn(page);
  await page.goto("/archive");
  await expect(page.getByTestId("archive-audio")).toHaveAttribute("src", /preview\.(mp3|wav)/);
  await expect(page.getByTestId("waveform")).toBeVisible();
  await expect(page.getByText("Listening is free. WAV downloads")).toBeVisible();
  await seekTo(page, 1.5);
  await page.getByRole("button", { name: /Chop at playhead/ }).click();
  await expect(page.getByRole("list", { name: "Chops" }).getByRole("listitem")).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (
          await sql<{ markers: number[] }>("select markers from asset_chops where user_id = $1", [
            userId,
          ])
        )[0]?.markers,
    )
    .toEqual([1.5]);
});

test("Pro: downloads the WAV and a single chop with DAW file names", async ({ page }) => {
  await signIn(page, { pro: true });
  await page.goto("/archive");
  await expect(page.getByRole("button", { name: "Download WAV" })).toBeVisible();
  const full = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download WAV" }).click();
  const file = await full;
  expect(file.suggestedFilename()).toBe(`${STOMP}.wav`);
  const bytes = readFileSync((await file.path()) as string);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");

  await seekTo(page, 1);
  await page.getByRole("button", { name: /Chop at playhead/ }).click();
  const chop = page.waitForEvent("download");
  await page
    .getByRole("list", { name: "Chops" })
    .getByRole("listitem")
    .first()
    .getByRole("button", { name: "WAV" })
    .click();
  const chopFile = await chop;
  expect(chopFile.suggestedFilename()).toBe(`${STOMP} (chop 1).wav`);
  const chopBytes = readFileSync((await chopFile.path()) as string);
  // One second, mono 16-bit: a much smaller file than the four-second master.
  expect(chopBytes.length).toBeLessThan(bytes.length / 2);
});

async function crateWithArchive(userId: string, name: string) {
  const [crate] = await sql<{ id: string }>(
    "insert into crates (user_id, name) values ($1, $2) returning id",
    [userId, name],
  );
  for (const [i, slug] of ["e2e-stomp", "e2e-waltz"].entries()) {
    await sql("insert into crate_assets (crate_id, asset_id, position) values ($1, $2, $3)", [
      crate?.id,
      await assetId(slug),
      i,
    ]);
  }
  return crate?.id as string;
}

test("Pro: DAW folder export writes WAVs and rights sidecars into a crate folder", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const written: Record<string, number | string> = {};
    (window as unknown as { __written: typeof written }).__written = written;
    const dir = (path: string): unknown => ({
      getDirectoryHandle: async (name: string) => dir(`${path}${name}/`),
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({
          write: async (data: Uint8Array) => {
            written[`${path}${name}`] = name.endsWith(".json")
              ? new TextDecoder().decode(data)
              : data.byteLength;
          },
          close: async () => undefined,
        }),
      }),
    });
    Object.assign(window, { showDirectoryPicker: async () => dir("") });
  });
  const userId = await signIn(page, { pro: true });
  const id = await crateWithArchive(userId, "Breaks: 1920s");
  await page.goto(`/crates/${id}`);
  await page.getByRole("button", { name: "Export to a DAW folder" }).click();
  await expect(page.getByTestId("crate-archive").getByRole("status")).toContainText(
    "Wrote 2 WAV files",
  );
  const written = await page.evaluate(
    () => (window as unknown as { __written: Record<string, number | string> }).__written,
  );
  expect(Object.keys(written).sort()).toEqual([
    `Breaks 1920s/${STOMP}.json`,
    `Breaks 1920s/${STOMP}.wav`,
    "Breaks 1920s/Open Ensemble - Free Waltz.json",
    "Breaks 1920s/Open Ensemble - Free Waltz.wav",
  ]);
  const sidecar = JSON.parse(written["Breaks 1920s/Open Ensemble - Free Waltz.json"] as string);
  expect(sidecar).toMatchObject({
    file: "Open Ensemble - Free Waltz.wav",
    rights: { basis: "cc_by", attribution: "Open Ensemble, CC BY 4.0" },
  });
});

test("Pro: browsers without a folder picker get one ZIP with the same layout", async ({ page }) => {
  await page.addInitScript(() => {
    // Safari and Firefox have no showDirectoryPicker.
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  const userId = await signIn(page, { pro: true });
  const id = await crateWithArchive(userId, "Zip crate");
  await page.goto(`/crates/${id}`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download as ZIP" }).click();
  const zip = await download;
  expect(zip.suggestedFilename()).toBe("Zip crate.zip");
  const path = join(mkdtempSync(join(tmpdir(), "crate-zip-")), "out.zip");
  writeFileSync(path, readFileSync((await zip.path()) as string));
  let listing: string;
  try {
    listing = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" });
  } catch {
    test.skip(true, "unzip isn't installed");
    return;
  }
  expect(listing.trim().split("\n").sort()).toEqual([
    `Zip crate/${STOMP}.json`,
    `Zip crate/${STOMP}.wav`,
    "Zip crate/Open Ensemble - Free Waltz.json",
    "Zip crate/Open Ensemble - Free Waltz.wav",
  ]);
});

test("Free: the crate shows archive recordings but export stays a Pro tool", async ({ page }) => {
  const userId = await signIn(page);
  const id = await crateWithArchive(userId, "Free crate");
  await page.goto(`/crates/${id}`);
  await expect(page.getByTestId("crate-archive")).toContainText("Example Stomp");
  await expect(page.getByText("DAW folder export is a Pro tool.")).toBeVisible();
});
