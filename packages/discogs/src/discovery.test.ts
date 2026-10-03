import { describe, expect, it } from "vitest";
import { checksumFor, fileNameOf, parseChecksums } from "./checksum";
import { discoverLatestDump, listingUrl, parseListing } from "./discovery";

const S3_LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><Name>discogs-data-dumps</Name><Prefix>data/2026/</Prefix>
<Contents><Key>data/2026/discogs_20260801_CHECKSUM.txt</Key></Contents>
<Contents><Key>data/2026/discogs_20260801_releases.xml.gz</Key></Contents>
<Contents><Key>data/2026/discogs_20260901_CHECKSUM.txt</Key></Contents>
<Contents><Key>data/2026/discogs_20260901_artists.xml.gz</Key></Contents>
<Contents><Key>data/2026/discogs_20260901_releases.xml.gz</Key></Contents>
</ListBucketResult>`;

const HTML_LISTING = `<html><body><ul>
<li><a href="https://discogs-data-dumps.s3.us-west-2.amazonaws.com/data/2026/discogs_20261001_releases.xml.gz">discogs_20261001_releases.xml.gz</a></li>
<li><a href="https://discogs-data-dumps.s3.us-west-2.amazonaws.com/data/2026/discogs_20261001_CHECKSUM.txt">CHECKSUM</a></li>
<li><a href="data/2026/discogs_20260901_releases.xml.gz">older</a></li>
<li>discogs_20261399_releases.xml.gz</li>
</ul></body></html>`;

describe("parseListing", () => {
  it("reads an S3 bucket listing, newest first", () => {
    const files = parseListing(S3_LISTING, "https://data.discogs.com/", 2026);
    expect(files.map((f) => f.dumpDate)).toEqual(["2026-09-01", "2026-08-01"]);
    expect(files[0]).toEqual({
      stamp: "20260901",
      dumpDate: "2026-09-01",
      releasesUrl: "https://data.discogs.com/data/2026/discogs_20260901_releases.xml.gz",
      checksumUrl: "https://data.discogs.com/data/2026/discogs_20260901_CHECKSUM.txt",
    });
  });

  it("reads an HTML listing with absolute and relative links and skips impossible dates", () => {
    const files = parseListing(HTML_LISTING, "http://localhost:4010", 2026);
    expect(files.map((f) => f.stamp)).toEqual(["20261001", "20260901"]);
    expect(files[0]?.releasesUrl).toBe(
      "https://discogs-data-dumps.s3.us-west-2.amazonaws.com/data/2026/discogs_20261001_releases.xml.gz",
    );
    expect(files[1]?.releasesUrl).toBe(
      "http://localhost:4010/data/2026/discogs_20260901_releases.xml.gz",
    );
    expect(files[1]?.checksumUrl).toBe(
      "http://localhost:4010/data/2026/discogs_20260901_CHECKSUM.txt",
    );
  });

  it("builds listing URLs", () => {
    expect(listingUrl("https://data.discogs.com", 2026)).toBe(
      "https://data.discogs.com/?prefix=data/2026/",
    );
  });
});

describe("discoverLatestDump", () => {
  it("falls back to last year's listing in early January", async () => {
    const seen: string[] = [];
    const dump = await discoverLatestDump({
      baseUrl: "https://example.test/",
      now: new Date("2027-01-01T06:00:00Z"),
      fetch: async (url) => {
        seen.push(url);
        const body = url.includes("2027") ? "<ListBucketResult></ListBucketResult>" : S3_LISTING;
        return { ok: true, status: 200, text: async () => body };
      },
    });
    expect(seen).toEqual([
      "https://example.test/?prefix=data/2027/",
      "https://example.test/?prefix=data/2026/",
    ]);
    expect(dump?.stamp).toBe("20260901");
  });

  it("returns null when nothing is listed and throws on server errors", async () => {
    const empty = await discoverLatestDump({
      now: new Date("2026-10-03T00:00:00Z"),
      fetch: async () => ({ ok: false, status: 404, text: async () => "" }),
    });
    expect(empty).toBeNull();
    await expect(
      discoverLatestDump({ fetch: async () => ({ ok: false, status: 503, text: async () => "" }) }),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe("checksums", () => {
  const text = [
    `${"a".repeat(64)}  discogs_20260901_artists.xml.gz`,
    `${"B".repeat(64)} *discogs_20260901_releases.xml.gz`,
    "garbage line",
    "",
  ].join("\n");

  it("parses sha256sum output in text and binary mode", () => {
    expect(parseChecksums(text).size).toBe(2);
    expect(checksumFor(text, "discogs_20260901_releases.xml.gz")).toBe("b".repeat(64));
    expect(checksumFor(text, "missing.xml.gz")).toBeNull();
  });

  it("takes the file name from a URL", () => {
    expect(fileNameOf("https://x.test/data/2026/discogs_20260901_releases.xml.gz?sig=1")).toBe(
      "discogs_20260901_releases.xml.gz",
    );
  });
});
