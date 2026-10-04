// Object storage for the cleared lane: Cloudflare R2 in production (S3 API, presigned GETs),
// a local folder in development and end-to-end tests. Only cleared-lane audio, previews and
// waveform peaks live here. Never YouTube media (rule 2).

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type SignedUrlOptions = { expiresIn?: number; downloadName?: string };

export type AssetStore = {
  kind: "r2" | "local";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** A URL a browser can fetch directly (presigned on R2), or null when the app must serve the key. */
  signedUrl(key: string, options?: SignedUrlOptions): Promise<string | null>;
  /** The file on disk for a key (local store only), for streaming with range requests. */
  pathFor?(key: string): string;
};

const KEY =
  /^cleared\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(master\.wav|preview\.(mp3|wav)|peaks\.json)$/;

/** Only the keys the cleared pipeline writes are valid; this also rules out path traversal. */
export function isAssetKey(key: string): boolean {
  return KEY.test(key);
}

export type AssetKeys = { wav: string; preview: string; peaks: string };

export function assetKeys(assetId: string, previewExt: "mp3" | "wav" = "mp3"): AssetKeys {
  return {
    wav: `cleared/${assetId}/master.wav`,
    preview: `cleared/${assetId}/preview.${previewExt}`,
    peaks: `cleared/${assetId}/peaks.json`,
  };
}

export function contentTypeFor(key: string): string {
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function checkKey(key: string): void {
  if (!isAssetKey(key)) throw new Error(`Invalid asset key: ${key}`);
}

export function localAssetStore(root: string): AssetStore {
  const base = resolve(root);
  const pathFor = (key: string) => {
    checkKey(key);
    const p = resolve(join(base, key));
    if (!p.startsWith(base + sep)) throw new Error(`Invalid asset key: ${key}`);
    return p;
  };
  return {
    kind: "local",
    pathFor,
    async put(key, body) {
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    async signedUrl() {
      return null;
    },
  };
}

export type R2AssetConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function r2AssetStore(config: R2AssetConfig): AssetStore {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    kind: "r2",
    async put(key, body, contentType) {
      checkKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      checkKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      } catch (err) {
        if ((err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },
    async delete(key) {
      checkKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    async signedUrl(key, options = {}) {
      checkKey(key);
      const disposition = options.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`
        : undefined;
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseContentDisposition: disposition,
        }),
        { expiresIn: options.expiresIn ?? 3600 },
      );
    },
  };
}

type StoreEnv = {
  R2_ACCOUNT_ID?: string | undefined;
  R2_ACCESS_KEY_ID?: string | undefined;
  R2_SECRET_ACCESS_KEY?: string | undefined;
  R2_BUCKET?: string | undefined;
  ASSET_STORE_DIR?: string | undefined;
};

/** R2 when its four variables are set, else a local folder when ASSET_STORE_DIR is, else none. */
export function assetStoreFromEnv(env: StoreEnv): AssetStore | null {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET)
    return r2AssetStore({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
  if (env.ASSET_STORE_DIR) return localAssetStore(env.ASSET_STORE_DIR);
  return null;
}
