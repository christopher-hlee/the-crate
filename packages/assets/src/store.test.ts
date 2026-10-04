import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetKeys, assetStoreFromEnv, contentTypeFor, isAssetKey, localAssetStore } from "./index";

const id = "0b7c6a1e-2f4d-4c1a-9a9e-1d2c3b4a5f60";

describe("asset keys", () => {
  it("accepts only the pipeline's keys", () => {
    const k = assetKeys(id);
    expect(Object.values(k).every(isAssetKey)).toBe(true);
    expect(isAssetKey(`cleared/${id}/preview.wav`)).toBe(true);
    for (const bad of [
      `cleared/${id}/../../etc/passwd`,
      `cleared/${id}/other.wav`,
      "dumps/x.gz",
      `/cleared/${id}/master.wav`,
    ]) {
      expect(isAssetKey(bad)).toBe(false);
    }
    expect(contentTypeFor(k.wav)).toBe("audio/wav");
    expect(contentTypeFor(k.preview)).toBe("audio/mpeg");
  });
});

describe("local store", () => {
  it("round-trips bytes and refuses unknown keys", async () => {
    const store = localAssetStore(mkdtempSync(join(tmpdir(), "assets-")));
    const { peaks } = assetKeys(id);
    expect(await store.get(peaks)).toBeNull();
    await store.put(peaks, new TextEncoder().encode("[]"), "application/json");
    expect(new TextDecoder().decode((await store.get(peaks)) ?? new Uint8Array())).toBe("[]");
    expect(await store.signedUrl(peaks)).toBeNull();
    await store.delete(peaks);
    expect(await store.get(peaks)).toBeNull();
    await expect(store.put("../escape.wav", new Uint8Array(), "audio/wav")).rejects.toThrow(
      /Invalid asset key/,
    );
  });

  it("picks R2, then a local folder, from the environment", () => {
    expect(assetStoreFromEnv({})).toBeNull();
    expect(assetStoreFromEnv({ ASSET_STORE_DIR: "/tmp/x" })?.kind).toBe("local");
    expect(
      assetStoreFromEnv({
        R2_ACCOUNT_ID: "a",
        R2_ACCESS_KEY_ID: "b",
        R2_SECRET_ACCESS_KEY: "c",
        R2_BUCKET: "d",
        ASSET_STORE_DIR: "/tmp/x",
      })?.kind,
    ).toBe("r2");
  });
});
