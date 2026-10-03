// Small non-cryptographic hashes for cache keys and generated artwork. Pure JS, so they run
// the same in Node, browsers and Hermes.

/** 32-bit FNV-1a over UTF-16 code units, with an optional seed mixed into the offset. */
export function hash32(input: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche so nearby inputs spread across the range.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** 64 bits of hash as 16 hex characters. */
export function hashHex(input: string): string {
  const a = hash32(input, 0x9e3779b9).toString(16).padStart(8, "0");
  const b = hash32(input, 0x7f4a7c15).toString(16).padStart(8, "0");
  return a + b;
}

/** JSON with object keys sorted, so equal values always serialise the same way. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
