import { createReadStream, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { type ParserStats, parseReleaseStream, parseReleases, ReleaseParser } from "./parser";
import { type DiscogsRelease, youtubeVideos } from "./types";

const FIXTURE = new URL("../../../fixtures/discogs/releases-small.xml", import.meta.url).pathname;

async function collect(gen: AsyncIterable<DiscogsRelease>): Promise<DiscogsRelease[]> {
  const out: DiscogsRelease[] = [];
  for await (const r of gen) out.push(r);
  return out;
}

function byId(releases: DiscogsRelease[], id: number): DiscogsRelease {
  const r = releases.find((x) => x.id === id);
  if (!r) throw new Error(`release ${id} missing`);
  return r;
}

describe("release parser", async () => {
  const releases = await collect(parseReleaseStream(createReadStream(FIXTURE), { gzip: false }));

  it("emits every release in order", () => {
    expect(releases.map((r) => r.id)).toEqual([101, 102, 103, 201, 202, 203, 204, 205]);
  });

  it("reads release-level fields and ignores extra artists and companies", () => {
    const r = byId(releases, 101);
    expect(r.title).toBe("Glass Harbour");
    expect(r.status).toBe("Accepted");
    expect(r.masterId).toBe(7001);
    expect(r.isMainRelease).toBe(true);
    expect(r.artists).toEqual([{ id: 9001, name: "Marlo Venn (2)", anv: "", join: "" }]);
    expect(r.labels).toEqual([{ id: 501, name: "Tidewater Sound", catno: "TW-001" }]);
    expect(r.year).toBe(1994);
    expect(r.released).toBe("1994-05-00");
    expect(r.country).toBe("UK");
    expect(r.genres).toEqual(["Electronic"]);
    expect(r.styles).toEqual(["Deep House", "Ambient"]);
    expect(r.formats).toEqual([
      { name: "Vinyl", qty: "1", text: "", descriptions: ['12"', "33 ⅓ RPM"] },
    ]);
    expect(r.tracklist.map((t) => [t.position, t.title, t.durationS])).toEqual([
      ["A1", "Glass Harbour", 372],
      ["A2", "Low Tide (Dub)", 340],
      ["B1", "Night Ferry", 423],
    ]);
  });

  it("reads video links with their Discogs embed flag", () => {
    const r = byId(releases, 102);
    expect(r.isMainRelease).toBe(false);
    expect(r.videos.map((v) => [v.videoId, v.embed, v.title])).toEqual([
      ["GlassHarb01", true, "Glass Harbour"],
      ["LowTideDub9", false, "M Venn - Low Tide"],
    ]);
  });

  it("decodes entities, keeps join strings and track artists", () => {
    const r = byId(releases, 201);
    expect(r.title).toBe("Sol & Engine EP");
    expect(r.masterId).toBeNull();
    expect(r.artists.map((a) => a.join)).toEqual(["&", ""]);
    expect(r.tracklist[0]?.artists.map((a) => a.name)).toEqual(["Ana Solis"]);
    expect(r.tracklist[1]?.artists).toEqual([]);
    expect(r.videos.map((v) => v.videoId)).toEqual(["CalleOcho_1", null]);
    expect(youtubeVideos(r).map((v) => v.videoId)).toEqual(["CalleOcho_1"]);
    expect(r.formats[0]?.descriptions).toContain("Test Pressing");
  });

  it("treats every element as optional", () => {
    const r = byId(releases, 202);
    expect(r).toMatchObject({
      title: "Untitled",
      artists: [],
      labels: [],
      year: null,
      country: null,
      genres: [],
      styles: [],
      formats: [],
      tracklist: [],
      videos: [],
      masterId: null,
      isMainRelease: false,
    });
  });

  it("flattens sub-tracks and keeps headings", () => {
    const r = byId(releases, 203);
    expect(r.title).toBe("東京の夜");
    expect(r.year).toBe(1982);
    expect(r.tracklist.map((t) => t.position)).toEqual(["", "A1", "A2a", "A2b"]);
    expect(r.tracklist.map((t) => t.title)).toEqual([
      "Side One",
      "Neon Rain",
      "First Light",
      "Last Train",
    ]);
    expect(youtubeVideos(r).map((v) => v.videoId)).toEqual(["NeonRain_77", "LastTrain_1"]);
  });

  it("deduplicates repeated links on one release", () => {
    const r = byId(releases, 204);
    expect(r.labels).toHaveLength(2);
    expect(youtubeVideos(r).map((v) => v.videoId)).toEqual(["CratesDJh01", "Dust_LoFi02"]);
  });

  it("parses gzip streams split at awkward byte boundaries", async () => {
    const gz = gzipSync(readFileSync(FIXTURE));
    const chunks: Buffer[] = [];
    for (let i = 0; i < gz.length; i += 7) chunks.push(gz.subarray(i, i + 7));
    const out = await collect(parseReleaseStream(Readable.from(chunks), { gzip: true }));
    expect(out).toEqual(releases);
  });

  it("splits multi-byte characters across chunks safely", async () => {
    const bytes = readFileSync(FIXTURE);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 3) chunks.push(bytes.subarray(i, i + 3));
    const out = await collect(parseReleases(Readable.from(chunks)));
    expect(byId(out, 203).title).toBe("東京の夜");
  });
});

describe("malformed input", () => {
  it("strips characters XML forbids", () => {
    const p = new ReleaseParser();
    p.write('<releases><release id="5"><title>Bad\u0001Title\u000B</title></release></releases>');
    p.end();
    const [r] = p.drain();
    expect(r?.title).toBe("BadTitle");
    expect(p.stats.errors).toBe(0);
  });

  it("escapes bare ampersands, even when an entity is split across chunks", async () => {
    const xml =
      '<releases><release id="6"><title>A & B</title></release><release id="7"><title>C &amp; D</title></release></releases>';
    const split = xml.indexOf("&amp;") + 2;
    const out = await collect(
      parseReleases(Readable.from([xml.slice(0, split), xml.slice(split)])),
    );
    expect(out.map((r) => r.title)).toEqual(["A & B", "C & D"]);
  });

  it("counts parse errors instead of throwing", async () => {
    const stats: ParserStats = { errors: 0, firstErrors: [] };
    const xml =
      '<releases><release id="6"><title>A</titl></release><release id="7"><title>OK</title></release></releases>';
    const out = await collect(parseReleases(Readable.from([xml]), stats));
    expect(out.map((r) => r.id)).toContain(7);
    expect(stats.errors).toBeGreaterThan(0);
    expect(stats.firstErrors[0]).toBeTypeOf("string");
  });

  it("skips releases without a usable id", () => {
    const p = new ReleaseParser();
    p.write('<releases><release id="x"><title>No id</title></release><release id="8"/></releases>');
    p.end();
    expect(p.drain().map((r) => r.id)).toEqual([8]);
  });
});
