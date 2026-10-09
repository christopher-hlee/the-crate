// Keyword filter → a Postgres tsquery string. Every word becomes a prefix match, so "break"
// finds "breaks" and "breakbeat". Text is folded to NFKC, lowercased and split into runs of
// letters, combining marks and digits, the way Postgres' parser splits the indexed names:
// "Post-Punk" is indexed as "post" and "punk" (and "post-punk"), so it is searched as
// "post:* & punk:*". Marks stay inside their word, so Devanagari or Thai words survive whole.
// Everything else is a separator, so user text can never inject tsquery operators.

const MAX_TERMS = 8;
/** A word needs a letter or digit; a stray combining mark on its own isn't one. */
const HAS_BASE = /[\p{L}\p{N}]/u;

export function keywordTsQuery(q: string | null | undefined): string | null {
  if (!q) return null;
  const words = q
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => HAS_BASE.test(w));
  const terms = [...new Set(words)].slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}
