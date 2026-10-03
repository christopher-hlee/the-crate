"use client";

// Exclusion lists kept on the device: record keys shown this session (no repeats), and the
// signed-out seen list. Both are capped to what the shuffle endpoint accepts.

import { SHUFFLE_EXCLUDE_MAX } from "@app/core";

function read(storage: Storage | undefined, key: string): string[] {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function push(storage: Storage | undefined, key: string, value: string): string[] {
  const list = read(storage, key).filter((x) => x !== value);
  list.push(value);
  const capped = list.slice(-SHUFFLE_EXCLUDE_MAX);
  try {
    storage?.setItem(key, JSON.stringify(capped));
  } catch {
    // Storage full or disabled: exclusions just get shorter.
  }
  return capped;
}

const SESSION_KEY = "crate.session.records";
const SEEN_KEY = "crate.seen.videos";

const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);
const local = () => (typeof window === "undefined" ? undefined : window.localStorage);

export const sessionRecords = {
  get: () => read(session(), SESSION_KEY),
  add: (recordKey: string) => push(session(), SESSION_KEY, recordKey),
};

export const seenVideos = {
  get: () => read(local(), SEEN_KEY),
  add: (videoId: string) => push(local(), SEEN_KEY, videoId),
  clear: () => {
    try {
      local()?.removeItem(SEEN_KEY);
    } catch {
      // ignore
    }
  },
};
