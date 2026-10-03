// The daily dig: a seeded order over a curated filter preset. Everyone gets the same dig on a
// given UTC day; the preset rotates through the week.

import type { Filters } from "./filters";
import { dailySeed } from "./seeds";

export type DailyPreset = { name: string; blurb: string; filters: Filters };

export const DAILY_PRESETS: readonly DailyPreset[] = [
  {
    name: "Deep and dusty",
    blurb: "Soul, funk and jazz from before 1980.",
    filters: { genres: ["Funk / Soul", "Jazz"], yearTo: 1979 },
  },
  {
    name: "Club tools",
    blurb: "House and techno twelves.",
    filters: { styles: ["House", "Techno", "Deep House"], formats: ["Vinyl"] },
  },
  {
    name: "Around the world",
    blurb: "Latin, reggae and world records.",
    filters: { genres: ["Latin", "Reggae", "Folk, World, & Country"] },
  },
  {
    name: "Breaks and beats",
    blurb: "Hip hop and breakbeat.",
    filters: { genres: ["Hip Hop"], styles: ["Boom Bap", "Instrumental", "Breakbeat"] },
  },
  {
    name: "Late night",
    blurb: "Ambient, downtempo and dub.",
    filters: { styles: ["Ambient", "Downtempo", "Dub", "Dub Techno"] },
  },
  {
    name: "Guitar cupboard",
    blurb: "Rock from the margins.",
    filters: {
      genres: ["Rock"],
      styles: ["Psychedelic Rock", "Krautrock", "Garage Rock", "Shoegaze"],
    },
  },
  { name: "Anything goes", blurb: "The whole crate, shuffled.", filters: {} },
];

export function dailyDig(at: Date): { seed: number; date: string; preset: DailyPreset } {
  const seed = dailySeed(at);
  const preset = DAILY_PRESETS[seed % DAILY_PRESETS.length] as DailyPreset;
  return { seed, date: at.toISOString().slice(0, 10), preset };
}
