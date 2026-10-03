import "server-only";
import type { StylesResponse } from "@app/api-client";
import type { Census, Queryable } from "@app/db";

let memo: { at: number; value: StylesResponse } | null = null;
const MEMO_MS = 10 * 60 * 1000;

const asList = (m: Record<string, number>) =>
  Object.entries(m)
    .map(([name, records]) => ({ name, records }))
    .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name));

/** The newest style census, shaped for the filter drawer. Memoised per instance for 10 min. */
export async function stylesResponse(db: Queryable): Promise<StylesResponse> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const res = await db.query<{ dump_date: string; census: Census }>(
    "select dump_date, census from style_census order by dump_date desc limit 1",
  );
  const row = res.rows[0];
  const value: StylesResponse = row
    ? {
        dumpDate: row.dump_date,
        basis: row.census.basis ?? "all",
        totalRecords: row.census.totalRecords,
        styles: Object.entries(row.census.styles)
          .map(([name, e]) => ({
            name,
            genre: e.genre,
            records: e.records,
            byYear: e.byYear,
            often: e.cooccurring.map(([s]) => s),
          }))
          .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)),
        genres: asList(row.census.genres),
        countries: asList(row.census.countries),
        formats: asList(row.census.formats),
        years: row.census.years,
      }
    : {
        dumpDate: null,
        basis: "all",
        totalRecords: 0,
        styles: [],
        genres: [],
        countries: [],
        formats: [],
        years: {},
      };
  memo = { at: Date.now(), value };
  return value;
}

export function resetCensusMemo(): void {
  memo = null;
}
