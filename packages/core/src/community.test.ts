import { describe, expect, it } from "vitest";
import { contributionPoints, displayNameProblem, rankFor } from "./community";

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
