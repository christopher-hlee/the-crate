import { describe, expect, it } from "vitest";
import {
  contributionPoints,
  displayNameKey,
  displayNameProblem,
  normalizeDisplayName,
  rankFor,
} from "./community";

describe("display names", () => {
  it("accepts readable names and rejects the rest", () => {
    expect(displayNameProblem("Crate Rat 42")).toBeNull();
    expect(displayNameProblem("josé_m.")).toBeNull();
    expect(displayNameProblem("ab")).not.toBeNull();
    expect(displayNameProblem(" -dash")).not.toBeNull();
    expect(displayNameProblem("x".repeat(31))).not.toBeNull();
    expect(displayNameProblem("<script>")).not.toBeNull();
    expect(displayNameProblem("Admin")).toBe("That name is reserved.");
  });

  it("sees through separators, case and width when checking reserved names", () => {
    for (const name of [
      "Admin.",
      "Moderator_",
      "Staff Team",
      "The-Crate",
      "Ａdmin",
      "Official 1",
    ]) {
      expect(displayNameProblem(name), name).toBe("That name is reserved.");
    }
    expect(displayNameProblem("Modern Sounds")).toBeNull();
    expect(displayNameProblem("Mod")).toBe("That name is reserved.");
  });

  it("refuses names that mix Latin, Cyrillic or Greek letters", () => {
    expect(displayNameProblem("\u0410dmin")).not.toBeNull(); // Cyrillic А + Latin
    expect(displayNameProblem("B\u03bfb")).not.toBeNull(); // Greek omicron
    expect(displayNameProblem("\u0414\u0438\u0434\u0436\u0435\u0439")).toBeNull(); // all Cyrillic
    expect(displayNameProblem("\u03a3\u03bf\u03c6\u03af\u03b1")).toBeNull(); // all Greek
    expect(displayNameProblem("DJ \u5c71\u7530")).toBeNull(); // Latin with Han is fine
  });

  it("normalizes width and compatibility forms before storing", () => {
    expect(normalizeDisplayName("  \uff24\uff2a Kool  ")).toBe("DJ Kool");
    expect(displayNameKey("D.J._Kool-Herc")).toBe("djkoolherc");
  });
});

describe("ranks", () => {
  it("weights comments and votes above favorites", () => {
    expect(contributionPoints({ favorites: 10, comments: 2, votes: 1 })).toBe(18);
  });

  it("climbs through the levels", () => {
    expect(rankFor(0)).toEqual({ level: 1, title: "Newcomer", points: 0 });
    expect(rankFor(9).level).toBe(1);
    expect(rankFor(10)).toMatchObject({ level: 2, title: "Digger" });
    expect(rankFor(250)).toMatchObject({ level: 4, title: "Selector" });
    expect(rankFor(1_000_000)).toMatchObject({ level: 6, title: "Legend" });
  });
});
