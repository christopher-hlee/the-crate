// Style census: per style, record counts by year, its usual genre and the styles it's most
// often tagged with. Feeds the filter drawer's counts and "often tagged with" suggestions.

import type { Census, Queryable, StyleCensusEntry } from "@app/db";

export const COOCCURRING_PER_STYLE = 8;

export async function computeCensus(db: Queryable): Promise<Census> {
  const anyPlayable = await db.query<{ ok: boolean }>(
    "select exists (select 1 from record_videos where playable) as ok",
  );
  const basis: Census["basis"] = anyPlayable.rows[0]?.ok ? "playable" : "all";
  const records = `(select distinct on (record_key) record_key, styles, genres, year, country, format_names
                      from record_videos ${basis === "playable" ? "where playable" : ""}
                     order by record_key) cr`;

  const [total, styleYear, styleGenre, cooccur, genres, countries, formats, years] =
    await Promise.all([
      db.query<{ n: number }>(`select count(*)::int as n from ${records}`),
      db.query<{ s: string; y: string; n: number }>(
        `select s, coalesce(year::text, 'unknown') as y, count(*)::int as n from ${records}, unnest(styles) s group by 1, 2`,
      ),
      db.query<{ s: string; g: string; n: number }>(
        `select s, g, count(*)::int as n from ${records}, unnest(styles) s, unnest(genres) g group by 1, 2`,
      ),
      db.query<{ a: string; b: string; n: number }>(
        `select a, b, n from (
         select a, b, n, row_number() over (partition by a order by n desc, b) as rn
           from (select a, b, count(*)::int as n from ${records}, unnest(styles) a, unnest(styles) b
                  where a <> b group by 1, 2) pairs
       ) ranked where rn <= ${COOCCURRING_PER_STYLE} order by a, n desc, b`,
      ),
      db.query<{ k: string; n: number }>(
        `select g as k, count(*)::int as n from ${records}, unnest(genres) g group by 1`,
      ),
      db.query<{ k: string; n: number }>(
        `select country as k, count(*)::int as n from ${records} where country is not null group by 1`,
      ),
      db.query<{ k: string; n: number }>(
        `select f as k, count(*)::int as n from ${records}, unnest(format_names) f group by 1`,
      ),
      db.query<{ k: string; n: number }>(
        `select year::text as k, count(*)::int as n from ${records} where year is not null group by 1`,
      ),
    ]);

  const styles: Record<string, StyleCensusEntry> = {};
  const entry = (s: string): StyleCensusEntry => {
    let e = styles[s];
    if (!e) {
      e = { genre: null, records: 0, byYear: {}, cooccurring: [] };
      styles[s] = e;
    }
    return e;
  };
  for (const r of styleYear.rows) {
    const e = entry(r.s);
    e.byYear[r.y] = r.n;
    e.records += r.n;
  }
  const bestGenre = new Map<string, { g: string; n: number }>();
  for (const r of styleGenre.rows) {
    const cur = bestGenre.get(r.s);
    if (!cur || r.n > cur.n || (r.n === cur.n && r.g < cur.g))
      bestGenre.set(r.s, { g: r.g, n: r.n });
  }
  for (const [s, { g }] of bestGenre) entry(s).genre = g;
  for (const r of cooccur.rows) entry(r.a).cooccurring.push([r.b, r.n]);

  const toMap = (rows: { k: string; n: number }[]) =>
    Object.fromEntries(
      rows.sort((a, b) => b.n - a.n || (a.k < b.k ? -1 : 1)).map((r) => [r.k, r.n]),
    );

  return {
    basis,
    totalRecords: total.rows[0]?.n ?? 0,
    styles: Object.fromEntries(Object.entries(styles).sort((a, b) => b[1].records - a[1].records)),
    genres: toMap(genres.rows),
    countries: toMap(countries.rows),
    formats: toMap(formats.rows),
    years: Object.fromEntries(
      years.rows.sort((a, b) => Number(a.k) - Number(b.k)).map((r) => [r.k, r.n]),
    ),
    refreshedAt: new Date().toISOString(),
  };
}

export async function storeCensus(db: Queryable, dumpDate: string, census: Census): Promise<void> {
  await db.query(
    `insert into style_census (dump_date, census) values ($1, $2)
     on conflict (dump_date) do update set census = excluded.census`,
    [dumpDate, JSON.stringify(census)],
  );
}

/** Refreshes the census for the newest dump (daily job, after validation moves playability). */
export async function refreshLatestCensus(db: Queryable): Promise<string | null> {
  const latest = await db.query<{ dump_date: string }>(
    "select to_char(dump_date, 'YYYY-MM-DD') as dump_date from ingest_runs where status = 'succeeded' order by dump_date desc limit 1",
  );
  const dumpDate = latest.rows[0]?.dump_date;
  if (!dumpDate) return null;
  await storeCensus(db, dumpDate, await computeCensus(db));
  return dumpDate;
}
