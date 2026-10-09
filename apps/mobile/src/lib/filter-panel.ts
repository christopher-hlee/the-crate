// The filter panel's logic, kept free of React Native so it can be tested off-device.

import {
  type Filters,
  filterHash,
  isEmptyFilter,
  normalizeFilters,
  PRO_FILTER_KEYS,
  proFiltersUsed,
} from "@app/core";

export const BPM_MIN = 20;
export const BPM_MAX = 400;

/** A BPM typed into a box, or undefined when it's empty, not a number or out of range. */
export function parseBpm(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= BPM_MIN && n <= BPM_MAX ? n : undefined;
}

export const bpmText = (value: number | undefined): string =>
  value === undefined ? "" : String(value);

/** Applies the two BPM boxes; an empty or invalid box clears its end of the range. */
export function withBpm(filters: Filters, fromText: string, toText: string): Filters {
  return { ...filters, bpmFrom: parseBpm(fromText), bpmTo: parseBpm(toText) };
}

/** Free view-count ceilings (a filter only; view counts never feed a score). */
export const MAX_VIEWS_OPTIONS = [
  { label: "≤1k views", value: 1_000 },
  { label: "≤10k views", value: 10_000 },
  { label: "≤100k views", value: 100_000 },
] as const;

export const CAMELOT_KEYS = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();

export function toggleIn(list: readonly string[] | undefined, value: string): string[] | undefined {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? [...set] : undefined;
}

export const KEYWORD_MIN = 2;
export const KEYWORD_MAX = 100;

/** Keyword search (Pro), applied on submit. An empty box clears it. */
export function applyKeywords(
  filters: Filters,
  text: string,
): { filters: Filters; error: null } | { filters: null; error: string } {
  const v = text.trim().replace(/\s+/g, " ");
  if (!v) return { filters: { ...filters, q: undefined }, error: null };
  if (v.length < KEYWORD_MIN)
    return { filters: null, error: `Type at least ${KEYWORD_MIN} characters.` };
  return { filters: { ...filters, q: v.slice(0, KEYWORD_MAX) }, error: null };
}

/** Whether the "Clear filters" link has anything to clear. */
export const hasFilters = (filters: Filters): boolean => !isEmptyFilter(filters);

export type SavedPreset = { id: string; name: string; filters: Filters };

/** The one problem that needs no message: the name box is still empty. */
export const NAME_PROMPT = "Name this set.";

/**
 * Why the current filters can't be saved under `name`, or null when they can. Saving under an
 * existing name replaces that preset, so it doesn't count against the limit.
 */
export function presetProblem(args: {
  name: string;
  filters: Filters;
  saved: readonly SavedPreset[];
  max: number;
  proFilters: boolean;
}): string | null {
  const name = args.name.trim();
  if (isEmptyFilter(args.filters)) return "Choose some filters first.";
  if (!args.proFilters && proFiltersUsed(args.filters).length > 0)
    return "These filters use Pro tools. Remove them to save this set.";
  if (!name) return NAME_PROMPT;
  const replacing = args.saved.some((p) => p.name === name);
  if (!replacing && args.saved.length >= args.max)
    return `You've saved ${args.max} filter sets. Delete one to save another.`;
  return null;
}

/** True when a preset holds the same search as the current filters. */
export function presetMatches(preset: Filters, current: Filters): boolean {
  return !isEmptyFilter(current) && filterHash(preset) === filterHash(current);
}

/** A saved set that uses Pro filters stays visible but locked for viewers without them. */
export function presetLocked(preset: Filters, proFilters: boolean): boolean {
  return !proFilters && proFiltersUsed(preset).length > 0;
}

export const PRESET_LOCKED = "That set uses Pro filters.";

export const PRO_FILTERS_LEFT_OUT =
  "Your filters used Pro tools, so those were left out. The rest of the dig is free.";

/** The filters without any Pro filter, or null when they use none (nothing to leave out). */
export function withoutProFilters(filters: Filters): Filters | null {
  if (proFiltersUsed(filters).length === 0) return null;
  const stripped: Filters = { ...filters };
  for (const k of PRO_FILTER_KEYS) delete stripped[k];
  return normalizeFilters(stripped);
}
