"use client";

// Dig player settings, kept on this device: where each pick starts, whether the next one
// follows on, an optional skip after a number of seconds heard, replays and comments.

import { z } from "zod";

export const START_OPTIONS = [0, 15, 30, 60] as const;
/** Seconds of listening before the dig moves on by itself; 0 is off. */
export const SKIP_OPTIONS = [0, 30, 60, 90, 120] as const;
/** The random start lands somewhere in this window, so short records still play a while. */
export const RANDOM_START = { min: 10, max: 75 } as const;

const SettingsSchema = z.object({
  autoAdvance: z.boolean().catch(true),
  start: z.union([z.literal("random"), z.number().int()]).catch(0),
  skipAfter: z.number().int().catch(0),
  repeats: z.boolean().catch(false),
  hideComments: z.boolean().catch(false),
});
export type PlayerSettings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: PlayerSettings = {
  autoAdvance: true,
  start: 0,
  skipAfter: 0,
  repeats: false,
  hideComments: false,
};

const KEY = "crate.player";

/** Parses stored settings, falling back field by field to the defaults. */
export function parseSettings(raw: string | null): PlayerSettings {
  try {
    const parsed = SettingsSchema.safeParse(raw ? JSON.parse(raw) : {});
    if (!parsed.success) return DEFAULT_SETTINGS;
    const s = parsed.data;
    return {
      ...s,
      start:
        s.start === "random" || (START_OPTIONS as readonly number[]).includes(s.start)
          ? s.start
          : 0,
      skipAfter: (SKIP_OPTIONS as readonly number[]).includes(s.skipAfter) ? s.skipAfter : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function readSettings(): PlayerSettings {
  try {
    return parseSettings(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(s: PlayerSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage disabled: settings last for this visit only.
  }
}

/** The second a new pick starts at. `random` is injectable for tests. */
export function startSecondsFor(s: PlayerSettings, random: () => number = Math.random): number {
  if (s.start !== "random") return s.start;
  return RANDOM_START.min + Math.floor(random() * (RANDOM_START.max - RANDOM_START.min + 1));
}
