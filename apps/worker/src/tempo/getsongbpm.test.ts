import { describe, expect, it } from "vitest";
import { lookupTempo, pickResult, searchUrl } from "./getsongbpm";

const body = {
  search: [
    {
      id: "a",
      title: "Night Ferry (Live)",
      tempo: "99",
      key_of: "Am",
      artist: { name: "Someone Else" },
    },
    { id: "b", title: "Night Ferry", tempo: "122", key_of: "F♯m", artist: { name: "Marlo Venn" } },
  ],
};

describe("GetSongBPM", () => {
  it("builds the search URL with artist and title", () => {
    const url = new URL(searchUrl("k", "Marlo Venn", "Night Ferry"));
    expect(url.origin + url.pathname).toBe("https://api.getsong.co/search/");
    expect(url.searchParams.get("lookup")).toBe("song:Night Ferry artist:Marlo Venn");
    expect(url.searchParams.get("type")).toBe("both");
  });

  it("takes the result whose title and artist both match", () => {
    expect(pickResult(body, "Marlo Venn", "Night Ferry")).toEqual({
      bpm: 122,
      camelotKey: "11A",
      confidence: 0.8,
    });
    expect(pickResult(body, "Nobody", "Night Ferry")).toBeNull();
    expect(pickResult({ search: { error: "no result" } }, "Marlo Venn", "Night Ferry")).toBeNull();
  });

  it("fails loudly on rate limits", async () => {
    await expect(
      lookupTempo("k", "a", "b", async () => ({ ok: false, status: 429, json: async () => ({}) })),
    ).rejects.toThrow(/rate limit/);
  });
});
