// Build: turn the staged dump into stg_record_videos in SQL. Groups every pressing by record
// for pressing counts, earliest years, the country rule, unions and label sizes; computes the
// deep-cut score from Discogs data only; carries rand_key and added_in_dump across months;
// joins accepted link suggestions; and registers new video IDs as unchecked.

import type { PoolClient } from "@app/db";

/** Weights for the deep-cut average. Discogs signals only; YouTube data never enters it. */
export const DEEP_CUT_WEIGHTS = {
  pressings: 1,
  labelSize: 1,
  noMaster: 1,
  formatNotes: 1,
} as const;
export const DEEP_FORMAT_NOTES = ["Promo", "Test Pressing", "White Label"] as const;

const TMP_TABLES = ["tmp_record_facts", "tmp_label_sizes", "tmp_record_deep", "tmp_links"] as const;

export async function dropBuildTemps(client: PoolClient): Promise<void> {
  for (const t of TMP_TABLES) await client.query(`drop table if exists ${t}`);
}

const RV_COLUMNS = `record_key, video_id, release_id, track_position, track_title, title, artist_display,
  artist_ids, label_id, label_name, catno, year, country, genres, styles, format_names,
  format_descriptions, pressings, deep_cut, bpm, camelot_key, tempo_source, rand_key, playable,
  added_in_dump`;

/** Release-derived columns shared by dump links and accepted suggestions. */
const RELEASE_FIELDS = `r.title, r.artist_display,
    coalesce(array(select (a->>'id')::bigint from jsonb_array_elements(r.artists) a
                   where jsonb_typeof(a->'id') = 'number'), '{}'::bigint[]),
    (r.labels->0->>'id')::bigint,
    nullif(regexp_replace(coalesce(r.labels->0->>'name', ''), '\\s+\\(\\d+\\)$', ''), ''),
    nullif(r.labels->0->>'catno', ''),
    rf.year, rf.country, rf.genres, rf.styles, rf.format_names, rf.format_descriptions,
    rf.pressings, d.deep_cut`;

const CARRY_FIELDS = `coalesce(o.rand_key, floor(random() * 2147483647)::int),
    coalesce(y.status = 'playable', false),
    coalesce(o.added_in_dump, $1::date)`;

export type BuildCounts = { newVideoIds: number; suggestionRows: number };

export async function buildRecordVideos(
  client: PoolClient,
  dumpDate: string,
): Promise<BuildCounts> {
  await dropBuildTemps(client);

  // Every pressing of every linked record, grouped by record key.
  await client.query(`
    create unlogged table tmp_record_facts as
    select f.record_key,
           count(*)::int as pressings,
           min(f.year) as year,
           (array_agg(f.country order by f.is_main_release desc, f.year asc nulls last, f.id)
              filter (where f.country is not null))[1] as country,
           (array_agg(f.label_id order by f.is_main_release desc, f.year asc nulls last, f.id)
              filter (where f.label_id is not null))[1] as label_id,
           array(select distinct x from unnest(array_cat_agg(f.genres)) x order by x) as genres,
           array(select distinct x from unnest(array_cat_agg(f.styles)) x order by x) as styles,
           array(select distinct x from unnest(array_cat_agg(f.format_names)) x order by x) as format_names,
           array(select distinct x from unnest(array_cat_agg(f.format_descriptions)) x order by x)
             as format_descriptions
      from stg_release_facts f
     where f.record_key in (select record_key from stg_releases)
     group by f.record_key`);
  await client.query("create index on tmp_record_facts (record_key)");

  // Label sizes count every release in the dump, linked or not.
  await client.query(`
    create unlogged table tmp_label_sizes as
    select label_id, count(*)::int as releases
      from stg_release_facts where label_id is not null group by label_id`);

  // Deep cut: average percentile ranks, higher is deeper. Fewer pressings, a smaller label,
  // no master and promo-style format notes all count as deeper.
  const w = DEEP_CUT_WEIGHTS;
  const total = w.pressings + w.labelSize + w.noMaster + w.formatNotes;
  await client.query(
    `create unlogged table tmp_record_deep (record_key text primary key, deep_cut real not null)`,
  );
  await client.query(
    `insert into tmp_record_deep (record_key, deep_cut)
     select rf.record_key,
            (($1::real * percent_rank() over (order by rf.pressings desc))
           + ($2::real * percent_rank() over (order by coalesce(ls.releases, 0) desc))
           + ($3::real * (case when rf.record_key like 'r:%' then 1 else 0 end))
           + ($4::real * (case when rf.format_descriptions && $5::text[] then 1 else 0 end))) / $6::real
       from tmp_record_facts rf
       left join tmp_label_sizes ls on ls.label_id = rf.label_id`,
    [w.pressings, w.labelSize, w.noMaster, w.formatNotes, [...DEEP_FORMAT_NOTES], total],
  );

  // One link per (record, video): prefer a link matched to a track, then the main release,
  // then the earliest pressing.
  await client.query(`
    create unlogged table tmp_links as
    select distinct on (v.record_key, v.video_id)
           v.record_key, v.video_id, v.release_id, v.track_position, v.track_title
      from stg_release_videos v
      join stg_releases r on r.id = v.release_id
     order by v.record_key, v.video_id, (v.track_position is null), r.is_main_release desc,
              r.year asc nulls last, r.id, v.link_order`);

  await client.query(
    `insert into stg_record_videos (${RV_COLUMNS})
     select l.record_key, l.video_id, l.release_id, l.track_position, l.track_title,
            ${RELEASE_FIELDS},
            b.bpm, b.camelot_key, b.bpm_source,
            ${CARRY_FIELDS}
       from tmp_links l
       join stg_releases r on r.id = l.release_id
       join tmp_record_facts rf on rf.record_key = l.record_key
       left join tmp_record_deep d on d.record_key = l.record_key
       left join record_videos o on o.record_key = l.record_key and o.video_id = l.video_id
       left join yt_videos y on y.video_id = l.video_id
       left join track_audio_best b on b.release_id = l.release_id and b.track_position = l.track_position`,
    [dumpDate],
  );

  // Accepted link suggestions survive every rebuild. They have no matched track.
  const suggestions = await client.query(
    `insert into stg_record_videos (${RV_COLUMNS})
     select s.record_key, s.video_id, r.id, null, null,
            ${RELEASE_FIELDS},
            null, null, null,
            ${CARRY_FIELDS}
       from (select distinct record_key, video_id from link_suggestions where status = 'accepted') s
       join lateral (select * from stg_releases x where x.record_key = s.record_key
                      order by x.is_main_release desc, x.year asc nulls last, x.id limit 1) r on true
       join tmp_record_facts rf on rf.record_key = s.record_key
       left join tmp_record_deep d on d.record_key = s.record_key
       left join record_videos o on o.record_key = s.record_key and o.video_id = s.video_id
       left join yt_videos y on y.video_id = s.video_id
      where not exists (select 1 from tmp_links l where l.record_key = s.record_key and l.video_id = s.video_id)`,
    [dumpDate],
  );

  // New IDs start unchecked. The Discogs embed flag is Discogs data and may change monthly.
  const yt = await client.query<{ new_ids: number }>(
    `with ins as (
       insert into yt_videos (video_id, dump_embed_flag, first_seen_dump)
       select video_id, bool_and(embed), $1::date from stg_release_videos group by video_id
       on conflict (video_id) do update set dump_embed_flag = excluded.dump_embed_flag
         where yt_videos.dump_embed_flag is distinct from excluded.dump_embed_flag
       returning (xmax = 0) as inserted
     )
     select count(*) filter (where inserted)::int as new_ids from ins`,
    [dumpDate],
  );

  return { newVideoIds: yt.rows[0]?.new_ids ?? 0, suggestionRows: suggestions.rowCount ?? 0 };
}

export type Diff = {
  records: number;
  recordVideos: number;
  addedRecords: number;
  removedRecords: number;
};

/** Compares staging with the live table before the swap. */
export async function diffCatalog(client: PoolClient): Promise<Diff> {
  const res = await client.query<{
    records: number;
    record_videos: number;
    added: number;
    removed: number;
  }>(`
    with new_keys as (select distinct record_key from stg_record_videos),
         old_keys as (select distinct record_key from record_videos)
    select (select count(*) from new_keys)::int as records,
           (select count(*) from stg_record_videos)::int as record_videos,
           (select count(*) from new_keys n where not exists (select 1 from old_keys o where o.record_key = n.record_key))::int as added,
           (select count(*) from old_keys o where not exists (select 1 from new_keys n where n.record_key = o.record_key))::int as removed`);
  const row = res.rows[0];
  return {
    records: row?.records ?? 0,
    recordVideos: row?.record_videos ?? 0,
    addedRecords: row?.added ?? 0,
    removedRecords: row?.removed ?? 0,
  };
}
