// Audio processing for cleared assets: fetch the source, make a 16-bit WAV master and a
// streaming preview, compute waveform peaks, and optionally analyse tempo and key.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  computePeaks,
  decodeWav,
  durationSeconds,
  encodeWav,
  type Peaks,
  toCamelot,
} from "@app/core";

const run = promisify(execFile);
const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;

export type AudioTools = {
  /** Path to ffmpeg, or null to accept WAV sources only (no transcoding, WAV preview). */
  ffmpeg: string | null;
  /** Essentia's streaming_extractor_music, or null to keep the manifest's tempo and key. */
  essentia: string | null;
  fetch?: typeof fetch;
};

export type ProcessedAudio = {
  sha256: string;
  wav: Uint8Array;
  preview: { bytes: Uint8Array; ext: "mp3" | "wav"; type: string };
  peaks: Peaks;
  durationS: number;
  sampleRate: number;
  channels: number;
  analysis: { bpm: number | null; camelotKey: string | null };
};

async function readSource(source: string, tools: AudioTools): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(source)) {
    const res = await (tools.fetch ?? fetch)(source, { redirect: "follow" });
    if (!res.ok) throw new Error(`Fetching ${source} failed: HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_SOURCE_BYTES) throw new Error(`${source} is larger than 1 GB`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await readFile(source));
}

export async function analyseWithEssentia(essentia: string, wavPath: string, dir: string) {
  const out = join(dir, "essentia.json");
  await run(essentia, [wavPath, out], { timeout: 10 * 60_000 });
  const json = JSON.parse(await readFile(out, "utf8")) as {
    rhythm?: { bpm?: number };
    tonal?: { key_edma?: { key?: string; scale?: string } };
  };
  const key = json.tonal?.key_edma;
  return {
    bpm: typeof json.rhythm?.bpm === "number" ? Math.round(json.rhythm.bpm * 10) / 10 : null,
    camelotKey: key?.key
      ? toCamelot(`${key.key} ${key.scale === "minor" ? "minor" : "major"}`)
      : null,
  };
}

export async function processAudio(source: string, tools: AudioTools): Promise<ProcessedAudio> {
  const input = await readSource(source, tools);
  const sha256 = createHash("sha256").update(input).digest("hex");
  const dir = await mkdtemp(join(tmpdir(), "cleared-"));
  try {
    const inPath = join(dir, "source");
    const wavPath = join(dir, "master.wav");
    await writeFile(inPath, input);
    let wav: Uint8Array;
    let preview: ProcessedAudio["preview"];
    if (tools.ffmpeg) {
      // Strip metadata, keep mono or stereo, 44.1 kHz 16-bit: what every DAW reads.
      await run(
        tools.ffmpeg,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inPath,
          "-vn",
          "-map_metadata",
          "-1",
          "-af",
          "aformat=channel_layouts=mono|stereo",
          "-ar",
          "44100",
          "-c:a",
          "pcm_s16le",
          "-f",
          "wav",
          wavPath,
        ],
        { timeout: 10 * 60_000 },
      );
      // MP3 plays in every browser, including Chromium builds without AAC.
      const previewPath = join(dir, "preview.mp3");
      await run(
        tools.ffmpeg,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          wavPath,
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          previewPath,
        ],
        { timeout: 10 * 60_000 },
      );
      wav = new Uint8Array(await readFile(wavPath));
      preview = {
        bytes: new Uint8Array(await readFile(previewPath)),
        ext: "mp3",
        type: "audio/mpeg",
      };
    } else {
      // No ffmpeg: WAV sources only, re-encoded as 16-bit; the master doubles as the preview.
      wav = encodeWav(decodeWav(input), 16);
      await writeFile(wavPath, wav);
      preview = { bytes: wav, ext: "wav", type: "audio/wav" };
    }
    const audio = decodeWav(wav);
    const analysis = tools.essentia
      ? await analyseWithEssentia(tools.essentia, wavPath, dir)
      : { bpm: null, camelotKey: null };
    return {
      sha256,
      wav,
      preview,
      peaks: computePeaks(audio, 2000),
      durationS: Math.round(durationSeconds(audio) * 1000) / 1000,
      sampleRate: audio.sampleRate,
      channels: audio.channels.length,
      analysis,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
