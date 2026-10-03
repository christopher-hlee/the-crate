// Opens a dump from a URL or a file as a byte stream, counting and hashing the raw bytes
// on the way through.

import { createHash, type Hash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable, Transform, type TransformCallback } from "node:stream";

export type ByteTap = { bytes: number; hash: Hash };

export function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

export function looksGzipped(source: string): boolean {
  return /\.gz(?:$|[?#])/i.test(source);
}

/** A pass-through that counts bytes and feeds a SHA-256 hash. */
export function tapStream(tap: ByteTap): Transform {
  return new Transform({
    transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
      tap.bytes += chunk.length;
      tap.hash.update(chunk);
      cb(null, chunk);
    },
  });
}

export function newTap(): ByteTap {
  return { bytes: 0, hash: createHash("sha256") };
}

export async function openSource(
  source: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Readable> {
  if (!isUrl(source)) return createReadStream(source, { highWaterMark: 1 << 20 });
  const res = await fetchImpl(source);
  if (!res.ok || !res.body) throw new Error(`GET ${source} returned HTTP ${res.status}`);
  return Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
}
