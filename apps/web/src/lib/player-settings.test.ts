import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, RANDOM_START, startSecondsFor } from "./player-settings";

describe("player settings", () => {
  it("falls back to the defaults for missing, broken or unknown values", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ start: 45, skipAfter: 7, repeats: "yes" }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("keeps known values", () => {
    const s = {
      autoAdvance: false,
      start: "random",
      skipAfter: 90,
      repeats: true,
      hideComments: true,
    };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it("starts at a fixed second or somewhere in the random window", () => {
    expect(startSecondsFor({ ...DEFAULT_SETTINGS, start: 30 })).toBe(30);
    const random = { ...DEFAULT_SETTINGS, start: "random" as const };
    expect(startSecondsFor(random, () => 0)).toBe(RANDOM_START.min);
    expect(startSecondsFor(random, () => 0.999999)).toBe(RANDOM_START.max);
  });
});
