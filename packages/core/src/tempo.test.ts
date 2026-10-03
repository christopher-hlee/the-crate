import { describe, expect, it } from "vitest";
import { communityConfidence, communityEstimate, SOURCE_CONFIDENCE, tapTempo } from "./tempo";

describe("tapTempo", () => {
  it("needs four taps and uses the median interval", () => {
    expect(tapTempo([0, 500, 1000])).toBeNull();
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 500, 1000, 1490, 2000, 2510, 3000])).toBe(120);
  });

  it("ignores pauses and double taps", () => {
    expect(tapTempo([0, 600, 1200, 1250, 1800, 6000, 6600, 7200])).toBe(100);
  });
});

describe("community estimates", () => {
  it("agreeing votes can outrank GetSongBPM", () => {
    expect(communityConfidence(1)).toBeCloseTo(0.45);
    expect(communityConfidence(3)).toBeLessThan(SOURCE_CONFIDENCE.getsongbpm);
    expect(communityConfidence(4)).toBeGreaterThan(SOURCE_CONFIDENCE.getsongbpm);
    expect(communityConfidence(50)).toBe(0.95);
  });

  it("takes the median and counts half/double time as agreeing", () => {
    expect(
      communityEstimate([
        { bpm: 120, camelotKey: "8A" },
        { bpm: 121, camelotKey: "8A" },
        { bpm: 60, camelotKey: "9A" },
        { bpm: 140, camelotKey: null },
        { bpm: null, camelotKey: "8A" },
      ]),
    ).toEqual({ bpm: 120.5, bpmAgreeing: 3, camelotKey: "8A", keyAgreeing: 3 });
    expect(communityEstimate([])).toEqual({
      bpm: null,
      bpmAgreeing: 0,
      camelotKey: null,
      keyAgreeing: 0,
    });
  });
});
