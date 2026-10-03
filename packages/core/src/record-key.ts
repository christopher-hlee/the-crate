// A record is a Discogs master, or a release that has no master.

export type RecordKeyParts = { kind: "master" | "release"; id: number };

export const RECORD_KEY_PATTERN = /^[mr]:[1-9][0-9]{0,15}$/;

export function recordKeyFor(masterId: number | null | undefined, releaseId: number): string {
  return masterId ? `m:${masterId}` : `r:${releaseId}`;
}

export function isRecordKey(value: string): boolean {
  return RECORD_KEY_PATTERN.test(value);
}

export function parseRecordKey(key: string): RecordKeyParts | null {
  if (!isRecordKey(key)) return null;
  const id = Number(key.slice(2));
  if (!Number.isSafeInteger(id)) return null;
  return { kind: key.startsWith("m:") ? "master" : "release", id };
}

export function discogsReleaseUrl(releaseId: number): string {
  return `https://www.discogs.com/release/${releaseId}`;
}

export function discogsMasterUrl(masterId: number): string {
  return `https://www.discogs.com/master/${masterId}`;
}

/** The discogs.com page for a record key. Every record links here (rule 17). */
export function discogsUrl(key: string): string {
  const parts = parseRecordKey(key);
  if (!parts) throw new Error(`Invalid record key: ${key}`);
  return parts.kind === "master" ? discogsMasterUrl(parts.id) : discogsReleaseUrl(parts.id);
}
