// Monthly catalog rebuild: staging tables derived from the live ones, indexes rebuilt from
// the live definitions after the bulk load, and a one-transaction swap that keeps index and
// constraint names canonical (live = "x", staging = "stg_x", previous month = "old_x").

import type pg from "pg";

export const CATALOG_TABLES = ["releases", "record_videos"] as const;
export type CatalogTable = (typeof CATALOG_TABLES)[number];

type Client = pg.PoolClient | pg.Client;

/** Build-time tables that are not swapped in. */
export const BUILD_TABLES = ["stg_release_facts", "stg_release_videos"] as const;

export const FACTS_COLUMNS = [
  "id",
  "master_id",
  "record_key",
  "is_main_release",
  "year",
  "country",
  "label_id",
  "genres",
  "styles",
  "format_names",
  "format_descriptions",
] as const;

export const RELEASE_VIDEO_COLUMNS = [
  "release_id",
  "record_key",
  "video_id",
  "embed",
  "track_position",
  "track_title",
  "link_order",
] as const;

export const RELEASE_COLUMNS = [
  "id",
  "master_id",
  "record_key",
  "is_main_release",
  "title",
  "artists",
  "artist_display",
  "labels",
  "year",
  "country",
  "genres",
  "styles",
  "formats",
  "tracklist",
] as const;

/** Drops last month's tables. Run at the start of the next ingest, after any rollback window. */
export async function dropOldCatalog(client: Client): Promise<void> {
  for (const t of CATALOG_TABLES) await client.query(`drop table if exists old_${t}`);
}

export async function dropStaging(client: Client): Promise<void> {
  for (const t of [...BUILD_TABLES, ...CATALOG_TABLES.map((x) => `stg_${x}`)]) {
    await client.query(`drop table if exists ${t}`);
  }
}

/**
 * Fresh staging tables. The swapped tables copy the live definitions (columns, defaults,
 * NOT NULL and CHECK constraints) without indexes, which are added after the load. The
 * build-only tables are unlogged: a failed run starts over anyway.
 */
export async function createStaging(client: Client): Promise<void> {
  await dropStaging(client);
  await client.query(`
    create unlogged table stg_release_facts (
      id                  bigint not null,
      master_id           bigint,
      record_key          text not null,
      is_main_release     boolean not null,
      year                smallint,
      country             text,
      label_id            bigint,
      genres              text[] not null,
      styles              text[] not null,
      format_names        text[] not null,
      format_descriptions text[] not null
    )`);
  await client.query(`
    create unlogged table stg_release_videos (
      release_id     bigint not null,
      record_key     text not null,
      video_id       text not null,
      embed          boolean not null,
      track_position text,
      track_title    text,
      link_order     smallint not null
    )`);
  for (const t of CATALOG_TABLES) {
    await client.query(
      `create table stg_${t} (like ${t} including defaults including constraints)`,
    );
  }
}

type IndexInfo = {
  name: string;
  def: string;
  constraint: string | null;
  constraintDef: string | null;
};

async function indexesOf(client: Client, table: string): Promise<IndexInfo[]> {
  const res = await client.query<{
    name: string;
    def: string;
    constraint: string | null;
    constraint_def: string | null;
  }>(
    `select i.relname as name,
            pg_get_indexdef(x.indexrelid) as def,
            c.conname as constraint,
            pg_get_constraintdef(c.oid) as constraint_def
       from pg_index x
       join pg_class i on i.oid = x.indexrelid
       left join pg_constraint c on c.conindid = x.indexrelid and c.conrelid = x.indrelid
      where x.indrelid = $1::regclass
      order by i.relname`,
    [table],
  );
  return res.rows.map((r) => ({
    name: r.name,
    def: r.def,
    constraint: r.constraint,
    constraintDef: r.constraint_def,
  }));
}

const INDEX_DEF = /^CREATE (UNIQUE )?INDEX (\S+) ON (?:(\S+)\.)?(\S+) (.*)$/;

/** Rewrites a live index definition to build the same index on the staging table. */
export function stagingIndexDef(def: string, table: string): string {
  const m = INDEX_DEF.exec(def);
  if (!m) throw new Error(`Unrecognised index definition: ${def}`);
  const [, unique, name, schema, onTable, rest] = m;
  if (onTable !== table) throw new Error(`Index ${name} is on ${onTable}, expected ${table}`);
  return `CREATE ${unique ?? ""}INDEX stg_${name} ON ${schema ? `${schema}.` : ""}stg_${table} ${rest}`;
}

/** Adds the live table's primary key and indexes to its staging copy, then analyzes it. */
export async function indexStaging(client: Client): Promise<void> {
  for (const t of CATALOG_TABLES) {
    for (const ix of await indexesOf(client, t)) {
      if (ix.constraint && ix.constraintDef) {
        await client.query(
          `alter table stg_${t} add constraint stg_${ix.constraint} ${ix.constraintDef}`,
        );
      } else {
        await client.query(stagingIndexDef(ix.def, t));
      }
    }
    await client.query(`analyze stg_${t}`);
  }
}

function canonical(name: string, prefix: string): string {
  return prefix !== "" && name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** Renames a table and every index and constraint on it from one prefix to another. */
async function renameSet(client: Client, table: string, from: string, to: string): Promise<void> {
  const source = `${from}${table}`;
  for (const ix of await indexesOf(client, source)) {
    if (ix.constraint) {
      await client.query(
        `alter table ${source} rename constraint ${ix.constraint} to ${to}${canonical(ix.constraint, from)}`,
      );
    } else {
      await client.query(`alter index ${ix.name} rename to ${to}${canonical(ix.name, from)}`);
    }
  }
  await client.query(`alter table ${source} rename to ${to}${table}`);
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [
    name,
  ]);
  return res.rows[0]?.ok === true;
}

/**
 * Live → old_*, stg_* → live, in one transaction. Readers wait at most `lockTimeout` for
 * the brief exclusive locks; on timeout the transaction rolls back and live tables stay.
 */
export async function swapCatalog(client: Client, lockTimeout = "15s"): Promise<void> {
  await client.query("begin");
  try {
    await client.query(`set local lock_timeout = '${lockTimeout.replace(/[^0-9a-z]/gi, "")}'`);
    for (const t of CATALOG_TABLES) {
      if (await tableExists(client, `old_${t}`)) await client.query(`drop table old_${t}`);
      await renameSet(client, t, "", "old_");
      await renameSet(client, t, "stg_", "");
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  }
}

/** Puts last month's tables back. Only valid when no catalog migration ran since the swap. */
export async function rollbackCatalog(client: Client): Promise<void> {
  for (const t of CATALOG_TABLES) {
    if (!(await tableExists(client, `old_${t}`))) throw new Error(`No old_${t} to roll back to`);
  }
  await client.query("begin");
  try {
    for (const t of CATALOG_TABLES) {
      if (await tableExists(client, `bad_${t}`)) await client.query(`drop table bad_${t}`);
      await renameSet(client, t, "", "bad_");
      await renameSet(client, t, "old_", "");
      await client.query(`drop table bad_${t}`);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  }
}
