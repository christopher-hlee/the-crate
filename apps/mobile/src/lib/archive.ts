// The archive on mobile (the spec's cleared lane): only in builds made with
// FEATURE_CLEARED_LANE. Its own audio, never YouTube's, so it may be kept offline and play in
// the background. Offline copies are the MP3 previews, kept in the app's documents folder.

import type { Asset } from "@app/api-client";
import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";

export const archiveEnabled = Boolean(
  (Constants.expoConfig?.extra as { archive?: boolean } | undefined)?.archive,
);

const dir = () => new Directory(Paths.document, "archive");

const offlineFile = (id: string) => new File(dir(), `${id}.mp3`);

export function offlineUri(id: string): string | null {
  const f = offlineFile(id);
  return f.exists ? f.uri : null;
}

export async function keepOffline(asset: Asset): Promise<string> {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  const f = offlineFile(asset.id);
  if (f.exists) return f.uri;
  const saved = await File.downloadFileAsync(asset.previewUrl, f);
  return saved.uri;
}

export function removeOffline(id: string): void {
  const f = offlineFile(id);
  if (f.exists) f.delete();
}

/** Writes bytes to a cache file for the share sheet ("Save to Files"). */
export function cacheFile(name: string, bytes: Uint8Array): File {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(bytes);
  return f;
}

export async function downloadToCache(
  url: string,
  name: string,
  headers: Record<string, string>,
): Promise<File> {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  return File.downloadFileAsync(url, f, { headers });
}
