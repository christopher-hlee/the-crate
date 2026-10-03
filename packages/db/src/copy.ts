// COPY ... FROM STDIN in text format, with backpressure. Used for the monthly bulk loads.

import { once } from "node:events";
import { finished } from "node:stream/promises";
import type pg from "pg";
import { from as copyFrom } from "pg-copy-streams";

export type CopyJson = { json: unknown };
export type CopyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[]
  | readonly number[]
  | CopyJson;

function escapeText(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

function arrayLiteral(values: readonly (string | number)[]): string {
  const parts = values.map((v) =>
    typeof v === "number" ? String(v) : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${parts.join(",")}}`;
}

function isJson(v: unknown): v is CopyJson {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "json" in v;
}

/** One field in COPY text format. */
export function copyField(value: CopyValue): string {
  if (value === null || value === undefined) return "\\N";
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "\\N";
    return String(value);
  }
  if (typeof value === "string") return escapeText(value);
  if (isJson(value)) return escapeText(JSON.stringify(value.json));
  return escapeText(arrayLiteral(value));
}

export function copyRow(values: readonly CopyValue[]): string {
  return `${values.map(copyField).join("\t")}\n`;
}

/** Streams rows into one table over a dedicated connection, flushing every `flushBytes`. */
export class CopyWriter {
  private buffer = "";
  private rows = 0;
  private constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly flushBytes: number,
  ) {}

  static async open(
    client: pg.PoolClient | pg.Client,
    table: string,
    columns: readonly string[],
    options: { flushBytes?: number } = {},
  ): Promise<CopyWriter> {
    if (!/^[a-z_][a-z0-9_]*$/.test(table) || columns.some((c) => !/^[a-z_][a-z0-9_]*$/.test(c))) {
      throw new Error("COPY table and column names must be simple identifiers");
    }
    const stream = client.query(copyFrom(`copy ${table} (${columns.join(", ")}) from stdin`));
    return new CopyWriter(stream, options.flushBytes ?? 1 << 20);
  }

  get count(): number {
    return this.rows;
  }

  async write(values: readonly CopyValue[]): Promise<void> {
    this.buffer += copyRow(values);
    this.rows++;
    if (this.buffer.length >= this.flushBytes) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer === "") return;
    const chunk = this.buffer;
    this.buffer = "";
    if (!this.stream.write(chunk))
      await once(this.stream as unknown as NodeJS.EventEmitter, "drain");
  }

  async end(): Promise<number> {
    await this.flush();
    this.stream.end();
    await finished(this.stream as unknown as NodeJS.WritableStream);
    return this.rows;
  }
}

/** Convenience: COPY an iterable of rows on a client and return the row count. */
export async function copyRows(
  client: pg.PoolClient | pg.Client,
  table: string,
  columns: readonly string[],
  rows: Iterable<readonly CopyValue[]> | AsyncIterable<readonly CopyValue[]>,
): Promise<number> {
  const writer = await CopyWriter.open(client, table, columns);
  for await (const row of rows) await writer.write(row);
  return writer.end();
}
