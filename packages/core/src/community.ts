// Community: display-name rules and the rank shown beside a comment. Rank rewards curation
// and contribution (favorites, comments, tempo and key votes), never plays or YouTube data.

export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{2,29}$/u;

/** Names that would impersonate the service or staff. */
const RESERVED = /^(admin|administrator|moderator|mod|staff|support|system|official|the ?crate)$/i;

export function displayNameProblem(name: string): string | null {
  const v = name.trim();
  if (!DISPLAY_NAME_PATTERN.test(v)) {
    return "Use 3 to 30 letters, numbers, spaces, dots, dashes or underscores, starting with a letter or number.";
  }
  if (RESERVED.test(v)) return "That name is reserved.";
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
