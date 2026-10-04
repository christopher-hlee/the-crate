import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AudioTools } from "./audio";

const run = promisify(execFile);

async function works(cmd: string, args: string[]): Promise<boolean> {
  try {
    await run(cmd, args, { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/** ffmpeg from FFMPEG_PATH or PATH when it runs; Essentia only when ESSENTIA_EXTRACTOR is set. */
export async function resolveAudioTools(env: {
  FFMPEG_PATH?: string | undefined;
  ESSENTIA_EXTRACTOR?: string | undefined;
}): Promise<AudioTools> {
  const ffmpeg = env.FFMPEG_PATH ?? "ffmpeg";
  return {
    ffmpeg: (await works(ffmpeg, ["-version"])) ? ffmpeg : null,
    essentia: env.ESSENTIA_EXTRACTOR ?? null,
  };
}
