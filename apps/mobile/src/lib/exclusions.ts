// Shuffle exclusions kept on the device: record keys shown this app session (no repeats)
// and, while signed out, the videos already seen. Signed-in users' seen list lives on the
// server as their history. Both lists are capped at what the shuffle endpoint accepts.
// Kept in memory: the keychain-backed store is meant for secrets, not 200-entry lists.

import { SHUFFLE_EXCLUDE_MAX } from "@app/core";

export type CappedList = {
  get: () => string[];
  add: (value: string) => void;
  clear: () => void;
};

export function cappedList(max = SHUFFLE_EXCLUDE_MAX): CappedList {
  let items: string[] = [];
  return {
    get: () => [...items],
    add: (value) => {
      items = [...items.filter((x) => x !== value), value].slice(-max);
    },
    clear: () => {
      items = [];
    },
  };
}

export const sessionRecords = cappedList();
export const seenVideos = cappedList();
