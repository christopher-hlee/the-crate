import { describe, expect, it } from "vitest";
import { keywordTsQuery } from "./keywords";

/** Builds strings whose exact code points matter (decomposed or compatibility forms). */
const cp = (...points: number[]) => String.fromCodePoint(...points);
const ACUTE = cp(0x301); // combining acute accent

describe("keywordTsQuery", () => {
  it("turns words into prefix matches joined with AND", () => {
    expect(keywordTsQuery("Drum Break")).toBe("drum:* & break:*");
    expect(keywordTsQuery("  café   açaí ")).toBe("café:* & açaí:*");
    expect(keywordTsQuery("funk funk")).toBe("funk:*");
  });

  it("splits at punctuation the way Postgres' parser does, instead of gluing words together", () => {
    // to_tsvector('simple', 'Post-Punk') holds 'post-punk', 'post' and 'punk'.
    expect(keywordTsQuery("Post-Punk")).toBe("post:* & punk:*");
    expect(keywordTsQuery("synth-pop")).toBe("synth:* & pop:*");
    expect(keywordTsQuery("Lo-Fi hip-hop")).toBe("lo:* & fi:* & hip:* & hop:*");
    expect(keywordTsQuery("UK Garage, 2-Step")).toBe("uk:* & garage:* & 2:* & step:*");
    expect(keywordTsQuery("R&B")).toBe("r:* & b:*");
    expect(keywordTsQuery("Rhythm & Blues")).toBe("rhythm:* & blues:*");
    // Straight and curly apostrophes both separate, as they do in the index.
    expect(keywordTsQuery("Drum'n'Bass")).toBe("drum:* & n:* & bass:*");
    expect(keywordTsQuery(`don${cp(0x2019)}t stop`)).toBe("don:* & t:* & stop:*");
  });

  it("keeps combining marks, so Indic and Thai words survive whole", () => {
    // हिंदी: Devanagari vowel signs and the anusvara are combining marks (\p{M}).
    const hindi = cp(0x939, 0x93f, 0x902, 0x926, 0x940);
    expect(keywordTsQuery(hindi)).toBe(`${hindi}:*`);
    // ลูกทุ่ง: Thai vowel and tone marks too.
    const thai = cp(0xe25, 0xe39, 0xe01, 0xe17, 0xe38, 0xe48, 0xe07);
    expect(keywordTsQuery(thai)).toBe(`${thai}:*`);
    expect(keywordTsQuery(`${thai} hits`)).toBe(`${thai}:* & hits:*`);
  });

  it("folds to NFKC before splitting", () => {
    // A decomposed é (e + U+0301) is composed, and a full-width letter becomes ASCII.
    expect(keywordTsQuery(`Cafe${ACUTE} ${cp(0xff26)}unk`)).toBe(`caf${cp(0xe9)}:* & funk:*`);
    // Compatibility forms that hide punctuation are split once folded: ⑴ is "(1)".
    expect(keywordTsQuery(`${cp(0x2474)} side`)).toBe("1:* & side:*");
    // A stray combining mark on its own is not a word.
    expect(keywordTsQuery(`${ACUTE} jazz`)).toBe("jazz:*");
    expect(keywordTsQuery(`${ACUTE}${ACUTE}`)).toBeNull();
  });

  it("strips tsquery operators and empty input", () => {
    expect(keywordTsQuery("a&b | !c:* <-> (d)")).toBe("a:* & b:* & c:* & d:*");
    expect(keywordTsQuery("it's 'quoted' \\ back")).toBe("it:* & s:* & quoted:* & back:*");
    expect(keywordTsQuery("!!! &&&")).toBeNull();
    expect(keywordTsQuery("")).toBeNull();
    expect(keywordTsQuery(undefined)).toBeNull();
  });

  it("caps the number of distinct terms", () => {
    expect(keywordTsQuery("a b c d e f g h i j")?.split(" & ")).toHaveLength(8);
    expect(keywordTsQuery("a a a b c d e f g h")?.split(" & ")).toEqual([
      "a:*",
      "b:*",
      "c:*",
      "d:*",
      "e:*",
      "f:*",
      "g:*",
      "h:*",
    ]);
  });
});
