import { describe, expect, it } from "vitest";
import { keywordTsQuery } from "./keywords";

describe("keywordTsQuery", () => {
  it("turns words into prefix matches joined with AND", () => {
    expect(keywordTsQuery("Drum Break")).toBe("drum:* & break:*");
    expect(keywordTsQuery("  café   açaí ")).toBe("café:* & açaí:*");
    expect(keywordTsQuery("funk funk")).toBe("funk:*");
  });

  it("strips tsquery operators and empty input", () => {
    expect(keywordTsQuery("a&b | !c:* <-> (d)")).toBe("ab:* & c:* & d:*");
    expect(keywordTsQuery("!!! &&&")).toBeNull();
    expect(keywordTsQuery("")).toBeNull();
    expect(keywordTsQuery(undefined)).toBeNull();
  });

  it("caps the number of terms", () => {
    expect(keywordTsQuery("a b c d e f g h i j")?.split(" & ")).toHaveLength(8);
  });
});
