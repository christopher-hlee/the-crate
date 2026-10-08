// Community: display-name rules and the rank shown beside a comment. Rank rewards curation
// and contribution (favorites, comments, tempo and key votes), never plays or YouTube data.

export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{2,29}$/u;

/**
 * Words that would impersonate the service or staff, checked against the name's key (see
 * displayNameKey), so "Moderator_" or "The-Crate" are caught too.
 */
const RESERVED_EXACT = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "staff",
  "support",
  "system",
  "official",
]);
const RESERVED_PREFIX = ["admin", "staff", "moderator", "official"];
const RESERVED_ANYWHERE = ["thecrate", "moderator"];

/** The name as stored: compatibility forms (fullwidth letters and the like) folded, trimmed. */
export function normalizeDisplayName(name: string): string {
  return name.normalize("NFKC").trim();
}

/** The comparison key: normalized, lowercased, with spaces, dots, dashes and underscores gone. */
export function displayNameKey(name: string): string {
  return normalizeDisplayName(name)
    .toLowerCase()
    .replace(/[ ._-]/g, "");
}

/** Latin, Cyrillic and Greek share lookalike letters, so a name may use only one of them. */
function mixesLookalikeScripts(name: string): boolean {
  const scripts = [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u];
  return scripts.filter((re) => re.test(name)).length > 1;
}

export function displayNameProblem(name: string): string | null {
  const v = normalizeDisplayName(name);
  if (!DISPLAY_NAME_PATTERN.test(v)) {
    return "Use 3 to 30 letters, numbers, spaces, dots, dashes or underscores, starting with a letter or number.";
  }
  if (mixesLookalikeScripts(v)) return "Use letters from one alphabet.";
  const key = displayNameKey(v);
  if (
    RESERVED_EXACT.has(key) ||
    RESERVED_PREFIX.some((w) => key.startsWith(w)) ||
    RESERVED_ANYWHERE.some((w) => key.includes(w))
  ) {
    return "That name is reserved.";
  }
  return null;
}

export const RANKS = [
  { min: 0, title: "Newcomer" },
  { min: 10, title: "Digger" },
  { min: 50, title: "Crate digger" },
  { min: 200, title: "Selector" },
  { min: 1000, title: "Archivist" },
  { min: 5000, title: "Legend" },
] as const;

export type Rank = { level: number; title: string; points: number };

export function contributionPoints(c: {
  favorites: number;
  comments: number;
  votes: number;
}): number {
  return c.favorites + 3 * c.comments + 2 * c.votes;
}

export function rankFor(points: number): Rank {
  let level = 0;
  for (const [i, r] of RANKS.entries()) if (points >= r.min) level = i;
  return { level: level + 1, title: RANKS[level]?.title ?? RANKS[0].title, points };
}
