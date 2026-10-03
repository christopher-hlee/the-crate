// Text normalization shared by track matching, search and display.

const FOLD: Record<string, string> = {
  ø: "o",
  Ø: "o",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ß: "ss",
  đ: "d",
  Đ: "d",
  ł: "l",
  Ł: "l",
  þ: "th",
  Þ: "th",
  ı: "i",
};

const FOLD_PATTERN = new RegExp(`[${Object.keys(FOLD).join("")}]`, "g");

/**
 * Lowercases, strips accents and punctuation, and collapses whitespace.
 * "Östermalm (Original Mix)" → "ostermalm original mix". "&" becomes "and";
 * apostrophes are dropped without leaving a gap ("Don't" → "dont").
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(FOLD_PATTERN, (ch) => FOLD[ch] ?? ch)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalized tokens of a string, in order, duplicates kept. */
export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  return n === "" ? [] : n.split(" ");
}

/** Removes Discogs' disambiguation suffix: "Louie Vega (2)" → "Louie Vega". */
export function stripDiscogsSuffix(name: string): string {
  return name.trim().replace(/\s+\(\d+\)$/, "");
}

export type ArtistCredit = {
  name: string;
  anv?: string | null | undefined;
  join?: string | null | undefined;
};

/**
 * Builds the display string for a list of artist credits. The name variation (ANV) wins
 * over the canonical name, suffixes like "(2)" are stripped, and join strings are spaced
 * the way Discogs prints them ("A, B & C", "A Feat. B").
 */
export function artistDisplay(credits: readonly ArtistCredit[]): string {
  let out = "";
  credits.forEach((credit, i) => {
    const anv = credit.anv?.trim();
    const name = anv && anv.length > 0 ? anv : stripDiscogsSuffix(credit.name.trim());
    out += name;
    if (i < credits.length - 1) {
      const join = credit.join?.trim() ?? "";
      if (join === "" || join === ",") out += ", ";
      else out += ` ${join} `;
    }
  });
  return out.trim();
}
