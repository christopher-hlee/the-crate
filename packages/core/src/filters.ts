// The typed filter object. Every shuffle, count and seeded order is built from one of
// these; packages/db turns it into parameterised SQL.

import { z } from "zod";
import { CAMELOT_PATTERN, type CamelotKey } from "./camelot";
import { hashHex, stableStringify } from "./hash";
import { MAX_YEAR, MIN_YEAR } from "./years";

const Label = z.string().trim().min(1).max(80);
const Year = z.number().int().min(MIN_YEAR).max(MAX_YEAR);
const Bpm = z.number().min(20).max(400);
const DiscogsId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const CamelotKeySchema = z
  .string()
  .regex(CAMELOT_PATTERN)
  .transform((v) => v as CamelotKey);

export const FiltersSchema = z.strictObject({
  genres: z.array(Label).max(20).optional(),
  styles: z.array(Label).max(30).optional(),
  yearFrom: Year.optional(),
  yearTo: Year.optional(),
  countries: z.array(Label).max(30).optional(),
  formats: z.array(Label).max(10).optional(),
  // Pro
  formatDescriptions: z.array(Label).max(10).optional(),
  bpmFrom: Bpm.optional(),
  bpmTo: Bpm.optional(),
  halfDouble: z.boolean().optional(),
  key: CamelotKeySchema.optional(),
  compatibleKeys: z.boolean().optional(),
  maxViews: z.number().int().min(0).max(1e13).optional(),
  deepCutMin: z.number().min(0).max(1).optional(),
  labelIds: z.array(DiscogsId).max(10).optional(),
  artistIds: z.array(DiscogsId).max(10).optional(),
});

export type Filters = z.infer<typeof FiltersSchema>;

export const FREE_FILTER_KEYS = [
  "genres",
  "styles",
  "yearFrom",
  "yearTo",
  "countries",
  "formats",
] as const satisfies readonly (keyof Filters)[];

export const PRO_FILTER_KEYS = [
  "formatDescriptions",
  "bpmFrom",
  "bpmTo",
  "halfDouble",
  "key",
  "compatibleKeys",
  "maxViews",
  "deepCutMin",
  "labelIds",
  "artistIds",
] as const satisfies readonly (keyof Filters)[];

export type ProFilterKey = (typeof PRO_FILTER_KEYS)[number];

function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The Pro filters a filter set uses. Gating happens on the server from this list. */
export function proFiltersUsed(filters: Filters): ProFilterKey[] {
  return PRO_FILTER_KEYS.filter((k) => isSet(filters[k]));
}

function uniqSorted<T extends string | number>(values: readonly T[] | undefined): T[] | undefined {
  if (!values || values.length === 0) return undefined;
  const out = [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/**
 * Canonical form: arrays deduplicated and sorted, empty values dropped, reversed ranges
 * swapped, and modifiers without a base filter removed. Equal searches hash equally.
 */
export function normalizeFilters(input: Filters): Filters {
  const f: Filters = {
    genres: uniqSorted(input.genres),
    styles: uniqSorted(input.styles),
    countries: uniqSorted(input.countries),
    formats: uniqSorted(input.formats),
    formatDescriptions: uniqSorted(input.formatDescriptions),
    labelIds: uniqSorted(input.labelIds),
    artistIds: uniqSorted(input.artistIds),
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    bpmFrom: input.bpmFrom,
    bpmTo: input.bpmTo,
    key: input.key,
    maxViews: input.maxViews,
    deepCutMin: input.deepCutMin,
  };
  if (f.yearFrom !== undefined && f.yearTo !== undefined && f.yearFrom > f.yearTo) {
    [f.yearFrom, f.yearTo] = [f.yearTo, f.yearFrom];
  }
  if (f.bpmFrom !== undefined && f.bpmTo !== undefined && f.bpmFrom > f.bpmTo) {
    [f.bpmFrom, f.bpmTo] = [f.bpmTo, f.bpmFrom];
  }
  if (input.halfDouble && (f.bpmFrom !== undefined || f.bpmTo !== undefined)) f.halfDouble = true;
  if (input.compatibleKeys && f.key !== undefined) f.compatibleKeys = true;
  if (f.deepCutMin === 0) f.deepCutMin = undefined;
  for (const k of Object.keys(f) as (keyof Filters)[]) {
    if (f[k] === undefined) delete f[k];
  }
  return f;
}

/** Stable cache key for a filter set. */
export function filterHash(filters: Filters): string {
  return hashHex(stableStringify(normalizeFilters(filters)));
}

export function isEmptyFilter(filters: Filters): boolean {
  return Object.keys(normalizeFilters(filters)).length === 0;
}

// Query-string form. Lists repeat their key (genre names can contain commas).
const LIST_PARAMS = {
  genre: "genres",
  style: "styles",
  country: "countries",
  format: "formats",
  format_desc: "formatDescriptions",
} as const;
const ID_LIST_PARAMS = { label: "labelIds", artist: "artistIds" } as const;
const NUMBER_PARAMS = {
  year_from: "yearFrom",
  year_to: "yearTo",
  bpm_from: "bpmFrom",
  bpm_to: "bpmTo",
  max_views: "maxViews",
  deep_cut_min: "deepCutMin",
} as const;
const BOOL_PARAMS = { half_double: "halfDouble", compatible: "compatibleKeys" } as const;

export const FILTER_PARAM_NAMES: readonly string[] = [
  ...Object.keys(LIST_PARAMS),
  ...Object.keys(ID_LIST_PARAMS),
  ...Object.keys(NUMBER_PARAMS),
  ...Object.keys(BOOL_PARAMS),
  "key",
];

export function filtersToSearchParams(input: Filters): [string, string][] {
  const f = normalizeFilters(input);
  const out: [string, string][] = [];
  for (const [param, key] of Object.entries(LIST_PARAMS)) {
    for (const v of f[key] ?? []) out.push([param, v]);
  }
  for (const [param, key] of Object.entries(ID_LIST_PARAMS)) {
    for (const v of f[key] ?? []) out.push([param, String(v)]);
  }
  for (const [param, key] of Object.entries(NUMBER_PARAMS)) {
    const v = f[key];
    if (v !== undefined) out.push([param, String(v)]);
  }
  for (const [param, key] of Object.entries(BOOL_PARAMS)) {
    if (f[key]) out.push([param, "1"]);
  }
  if (f.key) out.push(["key", f.key]);
  return out;
}

function toNumber(raw: string): number {
  return raw.trim() === "" ? Number.NaN : Number(raw);
}

/** Parses filters from query parameters. `getAll` returns every value for a name. */
export function filtersFromSearchParams(
  getAll: (name: string) => readonly string[],
): ReturnType<typeof FiltersSchema.safeParse> {
  const raw: Record<string, unknown> = {};
  for (const [param, key] of Object.entries(LIST_PARAMS)) {
    const values = getAll(param);
    if (values.length > 0) raw[key] = [...values];
  }
  for (const [param, key] of Object.entries(ID_LIST_PARAMS)) {
    const values = getAll(param);
    if (values.length > 0) raw[key] = values.map(toNumber);
  }
  for (const [param, key] of Object.entries(NUMBER_PARAMS)) {
    const v = getAll(param)[0];
    if (v !== undefined) raw[key] = toNumber(v);
  }
  for (const [param, key] of Object.entries(BOOL_PARAMS)) {
    const v = getAll(param)[0];
    if (v !== undefined) raw[key] = v === "1" || v === "true";
  }
  const key = getAll("key")[0];
  if (key !== undefined) raw.key = key.toUpperCase();
  return FiltersSchema.safeParse(raw);
}
