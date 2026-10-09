// Product-wide constants. Plan limits live in plans.ts and feature flags in flags.ts.

/** Working name; the product name is an open decision (docs/SPEC.md). */
export const APP_NAME = "The Crate";

/** Placeholder reverse-DNS app ID until the name is decided. Feeds the WebView Referer. */
export const DEFAULT_APP_ID = "com.example.cratedig";

/**
 * Shown as the contact point until the owner sets NEXT_PUBLIC_SUPPORT_EMAIL and
 * EXPO_PUBLIC_SUPPORT_EMAIL (docs/PLAN.md). Always marked as a placeholder where it appears.
 */
export const SUPPORT_EMAIL_PLACEHOLDER = "support@example.com";

/** A comment hides itself once this many different people with a display name report it. */
export const COMMENT_HIDE_AFTER_REPORTS = 3;

/** Commenters one account can block. */
export const COMMENT_BLOCKS_MAX = 1000;

/** Unseeded shuffle: rand_key is uniform in [0, RAND_KEY_MAX). */
export const RAND_KEY_MAX = 2 ** 31 - 1;

/** Below this many matches, the shuffle picks from a cached ID list (see phase-0-report). */
export const DEFAULT_NARROW_FILTER_THRESHOLD = 5000;

/** Filter-count queries stop at this many rows and show "10,000+". */
export const MATCH_COUNT_CAP = 10_000;

export const CACHE_TTL = {
  narrowListSeconds: 60 * 60,
  seededPicksSeconds: 24 * 60 * 60,
  seededPicksCached: 500,
} as const;

export const SEEDED_PAGE_SIZE = 50;

/** Exclusion lists the client may send with a shuffle request. */
export const SHUFFLE_EXCLUDE_MAX = 200;

/** Log a play after this many seconds of playback. */
export const PLAY_LOG_AFTER_SECONDS = 5;

export const YOUTUBE = {
  /** Units per day this app may spend; the project's quota is 10,000. */
  defaultDailyUnitBudget: 8000,
  idsPerCall: 50,
  unitsPerVideosListCall: 1,
  /** Revalidate a video once its last check is this old. */
  revalidateAfterDays: 25,
  /** Rule 7: refresh or delete stored API data within this many days. */
  maxDataAgeDays: 30,
} as const;

export const GETSONGBPM = {
  hardLimitPerHour: 3000,
  requestsPerHour: 2500,
} as const;

/** Requests per window, per IP when signed out and per user when signed in. */
export const RATE_LIMITS = {
  shuffle: { limit: 120, windowSeconds: 60 },
  read: { limit: 300, windowSeconds: 60 },
  write: { limit: 60, windowSeconds: 60 },
  report: { limit: 20, windowSeconds: 60 * 10 },
  linkSuggestion: { limit: 20, windowSeconds: 60 * 60 },
  tempoVote: { limit: 120, windowSeconds: 60 * 60 },
  comment: { limit: 10, windowSeconds: 60 * 10 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;
