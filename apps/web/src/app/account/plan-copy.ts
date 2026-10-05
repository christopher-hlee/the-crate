// Plan copy for the account page, derived from PLAN_LIMITS and the filter key lists in
// @app/core, so the page can't drift from what the server enforces.

import {
  type Filters,
  FREE_FILTER_KEYS,
  PLAN_LIMITS,
  type PlanLimits,
  PRO_FILTER_KEYS,
} from "@app/core";

const n = (v: number) => v.toLocaleString("en-US");

const FILTER_GROUPS: { label: string; keys: readonly (keyof Filters)[] }[] = [
  { label: "Tempo, key and max-views filters", keys: ["bpmFrom", "key", "maxViews"] },
  {
    label: 'Keyword, topic-channel and "more from" filters (release, channel, label, artist)',
    keys: ["q", "topicOnly", "recordKeys", "channelIds", "labelIds", "artistIds"],
  },
  { label: "Deep-cut and format-note filters", keys: ["deepCutMin", "formatDescriptions"] },
];

const free = new Set<string>(FREE_FILTER_KEYS);
const pro = new Set<string>(PRO_FILTER_KEYS);
const FREE_FILTERS = FILTER_GROUPS.filter((g) => g.keys.every((k) => free.has(k)));
const PRO_FILTERS = FILTER_GROUPS.filter((g) => g.keys.every((k) => pro.has(k)));

function crates(l: PlanLimits): string | null {
  if (l.maxCrates === 0) return null;
  if (l.maxCrates === null) return "Unlimited crates";
  const items = l.maxItemsPerCrate === null ? "unlimited" : n(l.maxItemsPerCrate);
  return `Crates (${n(l.maxCrates)} × ${items} records)`;
}

function present(lines: (string | null | false)[]): string[] {
  return lines.filter((l): l is string => typeof l === "string");
}

/** What a signed-in Free account gets. */
export function freeFeatures(l: PlanLimits = PLAN_LIMITS.free): string[] {
  return present([
    `Favorites (up to ${n(l.maxFavorites)})`,
    `${n(l.maxSavedFilters)} saved filters`,
    l.notes && "Notes",
    ...FREE_FILTERS.map((g) => g.label),
    l.tempoVotes && "Tap tempo and tempo/key votes",
    l.comments && "Comments",
    `${n(l.historyWindow)}-play history`,
  ]);
}

/** What Pro adds on top of Free. */
export function proFeatures(l: PlanLimits = PLAN_LIMITS.pro): string[] {
  return present([
    crates(l),
    ...(l.proFilters ? PRO_FILTERS.map((g) => g.label) : []),
    `${n(l.historyWindow)}-play history`,
    l.crateExport && "CSV and JSON crate sheets",
    l.createShared && "Share links and seeded crates",
    l.youtubePlaylist && "Open as YouTube playlist",
    !l.ads && "No ads",
  ]);
}

/** One line on what the viewer's own plan allows, from the limits the server sent. */
export function limitsSummary(l: {
  maxCrates: number | null;
  maxItemsPerCrate: number | null;
  historyWindow: number;
  maxFavorites: number;
  maxSavedFilters: number;
}): string {
  return present([
    crates({ ...PLAN_LIMITS.free, ...l }),
    `${n(l.maxFavorites)} favorites`,
    `${n(l.maxSavedFilters)} saved filters`,
    `history keeps your last ${n(l.historyWindow)} plays`,
  ]).join(" · ");
}
