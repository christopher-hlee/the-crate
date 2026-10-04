// Keyword filter → a Postgres tsquery string. Every word becomes a prefix match, so "break"
// finds "breaks" and "breakbeat". Words are reduced to letters and digits; anything else is
// dropped, so user text can never inject tsquery operators.

const MAX_TERMS = 8;

export function keywordTsQuery(q: string | null | undefined): string | null {
  if (!q) return null;
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((w) => w.length > 0)
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return [...new Set(terms)].map((t) => `${t}:*`).join(" & ");
}
