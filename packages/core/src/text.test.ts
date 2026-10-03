import { describe, expect, it } from "vitest";
import { artistDisplay, normalizeText, stripDiscogsSuffix, tokenize } from "./text";

describe("normalizeText", () => {
  it("lowercases, strips accents and punctuation, collapses spaces", () => {
    expect(normalizeText("  Östermalm   (Original Mix) ")).toBe("ostermalm original mix");
    expect(normalizeText("Café—Del   Mar!!")).toBe("cafe del mar");
  });

  it("folds letters that do not decompose", () => {
    expect(normalizeText("Ørsted Æble Straße Łódź")).toBe("orsted aeble strasse lodz");
  });

  it("drops apostrophes without leaving a gap and spells out ampersands", () => {
    expect(normalizeText("Don't Stop")).toBe("dont stop");
    expect(normalizeText("Rock & Roll")).toBe("rock and roll");
  });

  it("keeps non-Latin letters and digits", () => {
    expect(normalizeText("東京 2000")).toBe("東京 2000");
  });

  it("returns an empty string for punctuation only", () => {
    expect(normalizeText(" -- !! ")).toBe("");
    expect(tokenize(" -- ")).toEqual([]);
  });
});

describe("artist names", () => {
  it("strips the Discogs disambiguation suffix", () => {
    expect(stripDiscogsSuffix("Louie Vega (2)")).toBe("Louie Vega");
    expect(stripDiscogsSuffix("Prince (12) ")).toBe("Prince");
    expect(stripDiscogsSuffix("Band (Live)")).toBe("Band (Live)");
  });

  it("prefers name variations and spaces joins", () => {
    expect(
      artistDisplay([
        { name: "Kenny Dope", anv: "", join: "&" },
        { name: "Louie Vega (2)", anv: "Little Louie Vega", join: "" },
      ]),
    ).toBe("Kenny Dope & Little Louie Vega");
    expect(
      artistDisplay([{ name: "A (3)", join: "," }, { name: "B", join: "Feat." }, { name: "C" }]),
    ).toBe("A, B Feat. C");
  });

  it("handles an empty credit list", () => {
    expect(artistDisplay([])).toBe("");
  });
});
