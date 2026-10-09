import { describe, expect, it } from "vitest";
import { persistableFilters } from "./filters";

const CHANNEL = "UCaaaaaaaaaaaaaaaaaaaaaa";

describe("persistableFilters", () => {
  it("drops YouTube channel IDs, which are API data kept 30 days at most", () => {
    expect(persistableFilters({ channelIds: [CHANNEL], styles: ["Dub"], topicOnly: true })).toEqual(
      {
        styles: ["Dub"],
        topicOnly: true,
      },
    );
    expect(persistableFilters({ channelIds: [CHANNEL] })).toEqual({});
  });

  it("keeps every Discogs-derived filter, normalized", () => {
    expect(
      persistableFilters({
        styles: ["Techno", "House", "House"],
        yearFrom: 1999,
        yearTo: 1990,
        recordKeys: ["m:1"],
        labelIds: [5],
        artistIds: [7],
        q: "  Deep   Funk ",
      }),
    ).toEqual({
      styles: ["House", "Techno"],
      yearFrom: 1990,
      yearTo: 1999,
      recordKeys: ["m:1"],
      labelIds: [5],
      artistIds: [7],
      q: "deep funk",
    });
  });

  it("does not change the object it was given", () => {
    const input = { channelIds: [CHANNEL], genres: ["Jazz"] };
    persistableFilters(input);
    expect(input.channelIds).toEqual([CHANNEL]);
  });
});
