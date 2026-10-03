// Streaming parser for Discogs' releases dump. Holds one release in memory at a time.

import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extractYouTubeId, parseDiscogsDuration, parseReleasedYear } from "@app/core";
import { SaxesParser, type SaxesTagPlain } from "saxes";
import type {
  DiscogsArtist,
  DiscogsFormat,
  DiscogsRelease,
  DiscogsTrack,
  DiscogsVideo,
} from "./types";

type TrackBuilder = DiscogsTrack & { subTracks: DiscogsTrack[] };

// Characters XML 1.0 forbids; older dumps occasionally contain them in free text.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
// An unescaped "&" makes saxes read the rest of the stream as an entity name.
const BARE_AMPERSAND = /&(?![A-Za-z][A-Za-z0-9]{0,31};|#[0-9]{1,8};|#x[0-9A-Fa-f]{1,8};)/g;
const MAX_ENTITY_LENGTH = 34;

function sanitize(text: string): string {
  return text.replace(INVALID_XML_CHARS, "").replace(BARE_AMPERSAND, "&amp;");
}

function toId(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function newRelease(id: number, status: string): DiscogsRelease {
  return {
    id,
    status,
    masterId: null,
    isMainRelease: false,
    title: "",
    artists: [],
    labels: [],
    released: "",
    year: null,
    country: null,
    genres: [],
    styles: [],
    formats: [],
    tracklist: [],
    videos: [],
  };
}

function newTrack(): TrackBuilder {
  return { position: "", title: "", durationS: null, artists: [], subTracks: [] };
}

function flatten(track: TrackBuilder): DiscogsTrack[] {
  const base: DiscogsTrack = {
    position: track.position,
    title: track.title,
    durationS: track.durationS,
    artists: track.artists,
  };
  if (track.subTracks.length === 0) return [base];
  return track.subTracks.map((sub) => ({
    position: sub.position || track.position,
    title: sub.title || track.title,
    durationS: sub.durationS,
    artists: sub.artists.length > 0 ? sub.artists : track.artists,
  }));
}

export type ParserStats = { errors: number; firstErrors: string[] };

/**
 * A push parser: feed it text with `write`, and collect finished releases with `drain`.
 * Element handling keys off the parent element, so the same tag name (title, name, id)
 * means different things under a release, a track, an artist or a video.
 */
export class ReleaseParser {
  readonly stats: ParserStats = { errors: 0, firstErrors: [] };
  private readonly sax = new SaxesParser({ xmlns: false, position: false });
  private readonly stack: string[] = [];
  private readonly done: DiscogsRelease[] = [];
  private text = "";
  private carry = "";
  private release: DiscogsRelease | null = null;
  private artist: DiscogsArtist | null = null;
  private artistOwner: "release" | "track" | null = null;
  private format: DiscogsFormat | null = null;
  private video: DiscogsVideo | null = null;
  private readonly tracks: TrackBuilder[] = [];
  private videoSrcs = new Set<string>();

  constructor() {
    this.sax.on("opentag", (tag) => this.open(tag));
    this.sax.on("closetag", (tag) => this.close(tag.name));
    this.sax.on("text", (t) => {
      this.text += t;
    });
    this.sax.on("cdata", (t) => {
      this.text += t;
    });
    this.sax.on("error", (err) => {
      this.stats.errors++;
      if (this.stats.firstErrors.length < 10) this.stats.firstErrors.push(err.message);
    });
  }

  write(chunk: string): void {
    let s = this.carry + chunk;
    this.carry = "";
    // Hold back a trailing "&..." that may be an entity split across chunks.
    const amp = s.lastIndexOf("&");
    if (amp !== -1 && s.length - amp <= MAX_ENTITY_LENGTH && s.indexOf(";", amp) === -1) {
      this.carry = s.slice(amp);
      s = s.slice(0, amp);
    }
    if (s !== "") this.sax.write(sanitize(s));
  }

  end(): void {
    if (this.carry !== "") this.sax.write(sanitize(this.carry));
    this.carry = "";
    this.sax.close();
  }

  drain(): DiscogsRelease[] {
    return this.done.splice(0, this.done.length);
  }

  private parent(): string | undefined {
    return this.stack[this.stack.length - 2];
  }

  private open(tag: SaxesTagPlain): void {
    this.stack.push(tag.name);
    this.text = "";
    const a = tag.attributes;
    const parent = this.parent();
    switch (tag.name) {
      case "release": {
        // After a fatal mismatch saxes closes every open element, so a release can show up
        // at the root. Accept it there too and carry on.
        if (parent !== "releases" && parent !== undefined) return;
        const id = toId(a.id);
        this.release = id === null ? null : newRelease(id, a.status ?? "");
        this.tracks.length = 0;
        this.videoSrcs = new Set();
        return;
      }
      case "artist": {
        const owner = this.stack[this.stack.length - 3];
        if (parent !== "artists") return;
        if (owner === "release") this.artistOwner = "release";
        else if (owner === "track") this.artistOwner = "track";
        else return;
        this.artist = { id: null, name: "", anv: "", join: "" };
        return;
      }
      case "label":
        if (parent === "labels" && this.release) {
          this.release.labels.push({
            id: toId(a.id),
            name: (a.name ?? "").trim(),
            catno: (a.catno ?? "").trim(),
          });
        }
        return;
      case "format":
        if (parent === "formats") {
          this.format = {
            name: (a.name ?? "").trim(),
            qty: (a.qty ?? "").trim(),
            text: (a.text ?? "").trim(),
            descriptions: [],
          };
        }
        return;
      case "master_id":
        if (parent === "release" && this.release) {
          this.release.isMainRelease = a.is_main_release === "true";
        }
        return;
      case "track":
        if (parent === "tracklist" || parent === "sub_tracks") this.tracks.push(newTrack());
        return;
      case "video":
        if (parent === "videos") {
          const src = (a.src ?? "").trim();
          const duration = toId(a.duration);
          this.video = {
            src,
            videoId: extractYouTubeId(src),
            embed: a.embed !== "false",
            title: "",
            durationS: duration,
          };
        }
        return;
    }
  }

  private close(name: string): void {
    const parent = this.parent();
    this.stack.pop();
    const raw = this.text;
    this.text = "";
    const r = this.release;
    if (!r) return;
    const track = this.tracks[this.tracks.length - 1];
    switch (name) {
      case "release":
        if (parent === "releases" || parent === undefined) {
          r.year = parseReleasedYear(r.released);
          this.done.push(r);
          this.release = null;
        }
        return;
      case "title":
        if (parent === "release") r.title = raw.trim();
        else if (parent === "track" && track) track.title = raw.trim();
        else if (parent === "video" && this.video) this.video.title = raw.trim();
        return;
      case "country":
        if (parent === "release") r.country = raw.trim() || null;
        return;
      case "released":
        if (parent === "release") r.released = raw.trim();
        return;
      case "master_id":
        if (parent === "release") r.masterId = toId(raw.trim());
        return;
      case "genre":
        if (parent === "genres" && raw.trim()) r.genres.push(raw.trim());
        return;
      case "style":
        if (parent === "styles" && raw.trim()) r.styles.push(raw.trim());
        return;
      case "description":
        if (parent === "descriptions" && this.format && raw.trim()) {
          this.format.descriptions.push(raw.trim());
        }
        return;
      case "format":
        if (parent === "formats" && this.format) {
          r.formats.push(this.format);
          this.format = null;
        }
        return;
      case "position":
        if (parent === "track" && track) track.position = raw.trim();
        return;
      case "duration":
        if (parent === "track" && track) track.durationS = parseDiscogsDuration(raw.trim());
        return;
      case "track": {
        if (parent !== "tracklist" && parent !== "sub_tracks") return;
        const finished = this.tracks.pop();
        if (!finished) return;
        if (parent === "sub_tracks") {
          this.tracks[this.tracks.length - 1]?.subTracks.push(finished);
        } else {
          r.tracklist.push(...flatten(finished));
        }
        return;
      }
      case "id":
        if (parent === "artist" && this.artist) this.artist.id = toId(raw.trim());
        return;
      case "name":
        if (parent === "artist" && this.artist) this.artist.name = raw.trim();
        return;
      case "anv":
        if (parent === "artist" && this.artist) this.artist.anv = raw.trim();
        return;
      case "join":
        if (parent === "artist" && this.artist) this.artist.join = raw.trim();
        return;
      case "artist":
        if (parent === "artists" && this.artist) {
          if (this.artistOwner === "release") r.artists.push(this.artist);
          else if (this.artistOwner === "track" && track) track.artists.push(this.artist);
          this.artist = null;
          this.artistOwner = null;
        }
        return;
      case "video":
        if (parent === "videos" && this.video) {
          if (this.video.src !== "" && !this.videoSrcs.has(this.video.src)) {
            this.videoSrcs.add(this.video.src);
            r.videos.push(this.video);
          }
          this.video = null;
        }
        return;
    }
  }
}

/** Parses an async stream of text or bytes into releases, one at a time. */
export async function* parseReleases(
  source: AsyncIterable<string | Uint8Array>,
  stats?: ParserStats,
): AsyncGenerator<DiscogsRelease> {
  const parser = new ReleaseParser();
  const decoder = new TextDecoder("utf-8");
  try {
    for await (const chunk of source) {
      parser.write(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }));
      yield* parser.drain();
    }
    parser.write(decoder.decode());
    parser.end();
    yield* parser.drain();
  } finally {
    if (stats) {
      stats.errors = parser.stats.errors;
      stats.firstErrors = parser.stats.firstErrors;
    }
  }
}

/** Parses a byte stream, gunzipping it first when `gzip` is set. */
export function parseReleaseStream(
  bytes: Readable,
  options: { gzip: boolean; stats?: ParserStats },
): AsyncGenerator<DiscogsRelease> {
  const input = options.gzip ? bytes.pipe(createGunzip()) : bytes;
  if (options.gzip) bytes.on("error", (err) => input.destroy(err));
  return parseReleases(input, options.stats);
}
