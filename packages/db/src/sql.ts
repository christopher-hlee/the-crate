// A minimal parameterised SQL builder. Values only ever enter queries as $n parameters.

export type Query = { text: string; values: unknown[] };

export class Params {
  readonly values: unknown[] = [];

  /** Adds a value and returns its placeholder, with an optional cast ("$3::text[]"). */
  add(value: unknown, cast?: string): string {
    this.values.push(value);
    return cast ? `$${this.values.length}::${cast}` : `$${this.values.length}`;
  }
}
