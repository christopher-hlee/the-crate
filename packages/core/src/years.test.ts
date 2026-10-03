import { describe, expect, it } from "vitest";
import { decadeLabel, decadeOf, parseReleasedYear } from "./years";

describe("parseReleasedYear", () => {
  it("takes the year from full and partial dates", () => {
    expect(parseReleasedYear("1999-03-00")).toBe(1999);
    expect(parseReleasedYear("1999-00-00")).toBe(1999);
    expect(parseReleasedYear("1999")).toBe(1999);
    expect(parseReleasedYear(" 2004-11-15 ")).toBe(2004);
  });

  it("returns null when unknown or implausible", () => {
    for (const v of [null, undefined, "", "0", "19xx", "199", "0000", "1200-01-01", "abcd-01-01"]) {
      expect(parseReleasedYear(v)).toBeNull();
    }
  });
});

describe("decades", () => {
  it("rounds down to the decade", () => {
    expect(decadeOf(1994)).toBe(1990);
    expect(decadeOf(2000)).toBe(2000);
    expect(decadeLabel(1979)).toBe("1970s");
  });
});
