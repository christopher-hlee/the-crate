import { describe, expect, it } from "vitest";
import {
  type Filters,
  FiltersSchema,
  filterHash,
  filtersFromSearchParams,
  filtersToSearchParams,
  isEmptyFilter,
  normalizeFilters,
  proFiltersUsed,
} from "./filters";
import { hash32, hashHex, stableStringify } from "./hash";
import { dailySeed, dailySeedDate, isValidSeed, newSeed } from "./seeds";

function roundTrip(f: Filters) {
  const params = filtersToSearchParams(f);
  const parsed = filtersFromSearchParams((name) =>
    params.filter(([k]) => k === name).map(([, v]) => v),
  );
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

describe("filters", () => {
  it("rejects unknown keys and bad values", () => {
    expect(FiltersSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(FiltersSchema.safeParse({ yearFrom: 1200 }).success).toBe(false);
    expect(FiltersSchema.safeParse({ key: "13A" }).success).toBe(false);
    expect(FiltersSchema.safeParse({ styles: [""] }).success).toBe(false);
    expect(FiltersSchema.safeParse({ styles: ["House"], yearFrom: 1990 }).success).toBe(true);
  });

  it("normalizes to a canonical form", () => {
    expect(
      normalizeFilters({
        styles: ["House", "Acid", "House"],
        genres: [],
        yearFrom: 1999,
        yearTo: 1990,
        halfDouble: true,
        compatibleKeys: true,
        deepCutMin: 0,
      }),
    ).toEqual({ styles: ["Acid", "House"], yearFrom: 1990, yearTo: 1999 });
  });

  it("hashes equal searches equally", () => {
    expect(filterHash({ styles: ["B", "A"], yearFrom: 1990 })).toBe(
      filterHash({ yearFrom: 1990, styles: ["A", "B", "A"], genres: [] }),
    );
    expect(filterHash({ styles: ["A"] })).not.toBe(filterHash({ styles: ["B"] }));
    expect(isEmptyFilter({ genres: [], halfDouble: true })).toBe(true);
  });

  it("lists the Pro filters in use", () => {
    expect(proFiltersUsed({ styles: ["House"], yearFrom: 1990 })).toEqual([]);
    expect(proFiltersUsed({ bpmFrom: 120, key: "8A", labelIds: [], halfDouble: false })).toEqual([
      "bpmFrom",
      "key",
    ]);
  });

  it("round-trips through query parameters, including commas in names", () => {
    const f: Filters = {
      genres: ["Folk, World, & Country"],
      styles: ["Deep House", "Acid"],
      yearFrom: 1988,
      yearTo: 1994,
      countries: ["UK", "US"],
      formats: ["Vinyl"],
      formatDescriptions: ["Promo"],
      bpmFrom: 120,
      bpmTo: 128,
      halfDouble: true,
      key: "8A",
      compatibleKeys: true,
      maxViews: 5000,
      deepCutMin: 0.7,
      labelIds: [5, 3],
      artistIds: [1],
    };
    expect(roundTrip(f)).toEqual(normalizeFilters(f));
  });

  it("rejects malformed query parameters", () => {
    const params: Record<string, string[]> = { year_from: ["abc"] };
    const parsed = filtersFromSearchParams((n) => params[n] ?? []);
    expect(parsed.success).toBe(false);
    const empty = filtersFromSearchParams(() => []);
    expect(empty.success && empty.data).toEqual({});
  });
});

describe("hashes", () => {
  it("is deterministic and spreads", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(hash32("abc")).not.toBe(hash32("abd"));
    expect(hash32("abc", 1)).not.toBe(hash32("abc", 2));
    expect(hashHex("abc")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("serialises objects with sorted keys", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(
      '{"a":[2,{"d":1}],"b":1}',
    );
  });
});

describe("seeds", () => {
  it("counts days since the epoch in UTC", () => {
    expect(dailySeed(new Date("1970-01-01T23:59:59Z"))).toBe(0);
    expect(dailySeed(new Date("2026-10-03T00:00:00Z"))).toBe(20729);
    expect(dailySeedDate(20729)).toBe("2026-10-03");
  });

  it("makes safe positive seeds", () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(isValidSeed(newSeed())).toBe(true);
    expect(isValidSeed(-1)).toBe(false);
    expect(isValidSeed(1.5)).toBe(false);
  });
});
