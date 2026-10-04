"use client";

// DAW folder export for archive recordings (never YouTube media):
//   Chrome and Edge: showDirectoryPicker → <chosen folder>/<crate name>/<Artist - Title [96 BPM 8A]>.wav + .json
//   Safari and Firefox: one ZIP with the same layout.

import type { Asset, AssetDownload } from "@app/api-client";
import { createZip, safeSegment, uniqueNames, type ZipEntry } from "@app/core";

type FileHandle = {
  createWritable(): Promise<{
    write(data: Blob | BufferSource): Promise<void>;
    close(): Promise<void>;
  }>;
};
type DirHandle = {
  getDirectoryHandle(name: string, opts: { create: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts: { create: boolean }): Promise<FileHandle>;
};
type PickerWindow = Window & {
  showDirectoryPicker?: (opts: { id?: string; mode?: "readwrite" }) => Promise<DirHandle>;
};

export function canPickFolder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as PickerWindow).showDirectoryPicker === "function"
  );
}

export type ExportFile = { stem: string; wav: Uint8Array; sidecar: AssetDownload["sidecar"] };

/** Fetches each recording's WAV and sidecar, with de-duplicated file names. */
export async function collectFiles(
  assets: readonly Pick<Asset, "id">[],
  download: (id: string) => Promise<AssetDownload>,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportFile[]> {
  const downloads: AssetDownload[] = [];
  for (const a of assets) downloads.push(await download(a.id));
  const stems = uniqueNames(downloads.map((d) => d.fileStem));
  const files: ExportFile[] = [];
  for (const [i, d] of downloads.entries()) {
    const res = await fetch(d.wavUrl, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Couldn't fetch ${d.fileStem} (HTTP ${res.status}).`);
    const stem = stems[i] ?? d.fileStem;
    files.push({
      stem,
      wav: new Uint8Array(await res.arrayBuffer()),
      sidecar: { ...d.sidecar, file: `${stem}.wav` },
    });
    onProgress?.(i + 1, downloads.length);
  }
  return files;
}

const sidecarBytes = (f: ExportFile) =>
  new TextEncoder().encode(`${JSON.stringify(f.sidecar, null, 2)}\n`);

/** Writes into a folder the user picks. Resolves false if they cancel the picker. */
export async function writeToFolder(
  crateName: string,
  files: readonly ExportFile[],
): Promise<boolean> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("This browser can't write to folders.");
  let root: DirHandle;
  try {
    root = await picker.call(window, { id: "crate-daw-export", mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return false;
    throw err;
  }
  const dir = await root.getDirectoryHandle(safeSegment(crateName), { create: true });
  for (const f of files) {
    for (const [name, data] of [
      [`${f.stem}.wav`, f.wav],
      [`${f.stem}.json`, sidecarBytes(f)],
    ] as const) {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(data as BufferSource);
      await w.close();
    }
  }
  return true;
}

export function zipFor(crateName: string, files: readonly ExportFile[]): Uint8Array {
  const folder = safeSegment(crateName);
  const entries: ZipEntry[] = files.flatMap((f) => [
    { name: `${folder}/${f.stem}.wav`, data: f.wav },
    { name: `${folder}/${f.stem}.json`, data: sidecarBytes(f) },
  ]);
  return createZip(entries);
}

export function saveBlob(bytes: Uint8Array, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
