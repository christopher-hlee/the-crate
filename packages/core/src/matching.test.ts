import { describe, expect, it } from "vitest";
import labeled from "../../../fixtures/matching/labeled.json" with { type: "json" };
import { isWholeRecordUpload, matchVideosToTracks, scoreMatch } from "./matching";

type Case = {
  name: string;
  artist: string;
  tracks: (string | string[])[][];
  videos: string[][];
  expected: Record<string, string | null>;
};

describe("track matching on hand-labeled cases", () => {
  for (const c of labeled.cases as Case[]) {
    it(c.name, () => {
      const tracks = c.tracks.map(([position, title, artists]) => ({
        position: position as string,
        title: title as string,
        artists: (artists as string[] | undefined) ?? [],
      }));
      const videos = c.videos.map(([videoId, title]) => ({
        videoId: videoId as string,
        title: title as string,
      }));
      const matches = matchVideosToTracks(videos, tracks, c.artist);
      const got: Record<string, string | null> = Object.fromEntries(
        videos.map((v) => [v.videoId, null]),
      );
      for (const m of matches) got[m.videoId] = tracks[m.trackIndex]?.position ?? null;
      expect(got).toEqual(c.expected);
    });
  }
});

describe("scoring", () => {
  it("is zero for empty or unrelated titles", () => {
    expect(scoreMatch("", { position: "A1", title: "Song" })).toBe(0);
    expect(scoreMatch("Something else", { position: "A1", title: "Song" })).toBe(0);
  });

  it("detects whole-record uploads", () => {
    expect(isWholeRecordUpload("Band - Album (FULL ALBUM)")).toBe(true);
    expect(isWholeRecordUpload("Band - Full EP 1994")).toBe(true);
    expect(isWholeRecordUpload("Band - Fullness")).toBe(false);
  });

  it("never assigns a track twice or a video twice", () => {
    const matches = matchVideosToTracks(
      [
        { videoId: "a", title: "X - Drift" },
        { videoId: "b", title: "X - Drift" },
      ],
      [
        { position: "A", title: "Drift" },
        { position: "B", title: "Drift" },
      ],
    );
    expect(new Set(matches.map((m) => m.videoId)).size).toBe(matches.length);
    expect(new Set(matches.map((m) => m.trackIndex)).size).toBe(matches.length);
  });
});
