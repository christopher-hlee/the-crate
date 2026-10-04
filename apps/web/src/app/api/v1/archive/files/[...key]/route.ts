// Serves archive files from a local store (development and end-to-end tests). With R2 the
// API hands out presigned URLs instead and this route answers 404. Supports byte ranges so
// the audio element can seek.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { contentTypeFor, isAssetKey } from "@app/assets";
import { archiveStore, isServableKey, requireArchive } from "@/server/archive";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { notFound, proRequired, route, unauthorized } from "@/server/http";
import { planFor } from "@/server/plan";

type Ctx = { params: Promise<{ key: string[] }> };

export const GET = route<Ctx>(async (req, { params }) => {
  requireArchive();
  const key = (await params).key.join("/");
  const store = archiveStore();
  if (store.kind !== "local" || !store.pathFor || !isAssetKey(key)) throw notFound("That file");
  const pool = db();
  const assetId = key.split("/")[1] ?? "";
  if (!(await isServableKey(pool, assetId))) throw notFound("That file");
  if (key.endsWith("/master.wav")) {
    const viewer = await getViewer(req);
    if (!viewer) throw unauthorized();
    if ((await planFor(pool, viewer.userId)).plan !== "pro")
      throw proRequired("Downloading WAV files");
  }
  const path = store.pathFor(key);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw notFound("That file");
  }
  const headers: Record<string, string> = {
    "content-type": contentTypeFor(key),
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=300",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
      },
    });
  }
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "content-length": String(size) } });
});
