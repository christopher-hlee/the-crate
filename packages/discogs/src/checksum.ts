// Discogs publishes `discogs_YYYYMMDD_CHECKSUM.txt` in sha256sum format:
//   <64 hex>  discogs_YYYYMMDD_releases.xml.gz
// (some tools write `<hex> *<file>` for binary mode).

export function parseChecksums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
    if (m?.[1] && m[2]) out.set(m[2], m[1].toLowerCase());
  }
  return out;
}

/** The published SHA-256 for a file name, or null when the checksum file doesn't list it. */
export function checksumFor(text: string, fileName: string): string | null {
  return parseChecksums(text).get(fileName) ?? null;
}

export function fileNameOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? url;
  return path.slice(path.lastIndexOf("/") + 1);
}
