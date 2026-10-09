// Comment moderation: the checks a comment passes before it is stored, and the contact point
// shown with the rules (App Store guideline 1.2). The blocked-terms list is supplied by the
// operator (COMMENT_BLOCKED_TERMS) and never lives in the repository.

import { SUPPORT_EMAIL_PLACEHOLDER } from "./config";

export const COMMENT_LINK_MESSAGE =
  "Comments can't include links or web addresses. Name the record, label or site instead.";
export const COMMENT_BLOCKED_TERM_MESSAGE =
  "That comment includes a word that isn't allowed here. Reword it and try again.";

/** Text as the filters see it: compatibility forms folded (NFKC), invisible characters gone, lowercase. */
export function moderationText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .toLowerCase();
}

// A scheme (https://, ftp://) or "www." anywhere is a link.
const SCHEME = /(?:^|[^\p{L}\p{N}])[a-z][a-z0-9+.-]{1,15}:\/\//u;
const WWW = /(?:^|[^\p{L}\p{N}])www\./u;

// Bare domains. Endings that are rarely words count wherever they appear; endings that are
// also everyday words ("it", "me", "live") count only when a path follows, as in youtu.be/x.
const TLDS = [
  "com|net|org|info|biz|io|co|ly|gg|tv|fm|xyz|online|click|ai|cc|ws|sh|gl|gd|tk|ml|ga|cf|gq",
  "ru|su|cn|de|uk|fr|nl|es|pl|br|jp|au|ca|eu|ch|se|dk|fi|cz|xxx|onion",
].join("|");
const PATH_TLDS = "be|me|ee|to|us|it|in|at|is|link|live|app|page|site|shop|store|top|club|blog";
const LABELS = String.raw`(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+`;
const BARE_DOMAIN = new RegExp(
  String.raw`(?:^|[^\p{L}\p{N}._-])${LABELS}(?:(${TLDS})(?![\p{L}\p{N}-])|(?:${PATH_TLDS})\/)`,
  "giu",
);
// "track.It slaps": a capitalized ending reads as a sentence after a missing space.
const SENTENCE_START = /^\p{Lu}\p{Ll}+$/u;

/** True when the text holds a URL, a www. address or a bare domain such as example.com. */
export function containsLink(text: string): boolean {
  const folded = text.normalize("NFKC").replace(/\p{Cf}/gu, "");
  const lower = folded.toLowerCase();
  if (SCHEME.test(lower) || WWW.test(lower)) return true;
  for (const m of folded.matchAll(BARE_DOMAIN)) {
    const tld = m[1];
    if (tld === undefined || !SENTENCE_START.test(tld)) return true;
  }
  return false;
}

export type BlockedTerms = { readonly terms: readonly string[]; readonly pattern: RegExp | null };

export const NO_BLOCKED_TERMS: BlockedTerms = { terms: [], pattern: null };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Parses the operator's comma-separated list. Terms are normalized like the text they are
 * matched against and match whole words only; a term with spaces matches that phrase.
 */
export function parseBlockedTerms(raw: string | null | undefined): BlockedTerms {
  const terms = [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((t) => moderationText(t).trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ];
  if (terms.length === 0) return NO_BLOCKED_TERMS;
  const alternatives = terms.map((t) => escapeRegExp(t).replace(/ /g, String.raw`\s+`));
  return {
    terms,
    pattern: new RegExp(
      String.raw`(?:^|[^\p{L}\p{N}])(?:${alternatives.join("|")})(?![\p{L}\p{N}])`,
      "u",
    ),
  };
}

export function hasBlockedTerm(text: string, blocked: BlockedTerms): boolean {
  return blocked.pattern ? blocked.pattern.test(moderationText(text)) : false;
}

/** Why a comment can't be posted, or null. The message never repeats the matched word. */
export function commentProblem(
  body: string,
  blocked: BlockedTerms = NO_BLOCKED_TERMS,
): string | null {
  if (containsLink(body)) return COMMENT_LINK_MESSAGE;
  if (hasBlockedTerm(body, blocked)) return COMMENT_BLOCKED_TERM_MESSAGE;
  return null;
}

/** The published contact address, or a marked placeholder until the owner sets one. */
export function supportContact(raw: string | null | undefined): {
  email: string;
  placeholder: boolean;
} {
  const email = raw?.trim() ?? "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email, placeholder: false };
  return { email: SUPPORT_EMAIL_PLACEHOLDER, placeholder: true };
}
