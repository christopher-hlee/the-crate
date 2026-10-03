// dump:generate — writes a synthetic releases dump (gzip or plain XML) for scale tests.

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import {
  COUNTRY_WEIGHTS,
  FORMATS,
  GENRE_WEIGHTS,
  phrase,
  pick,
  pickWeighted,
  RARE_DESCRIPTIONS,
  type Rng,
  seededRng,
  stylesFor,
  videoId,
  year,
} from "../synthetic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type MasterState = {
  id: number;
  artist: string;
  artistId: number;
  title: string;
  genre: string;
  styles: string[];
  year: number;
  videos: string[];
  tracks: string[];
};

function* releasesXml(count: number, rng: Rng): Generator<string> {
  yield "<releases>\n";
  let releaseId = 1;
  let masterId = 1;
  let artistId = 1;
  let labelId = 1;
  while (releaseId <= count) {
    const genre = pickWeighted(rng, GENRE_WEIGHTS);
    const hasMaster = rng() < 0.6;
    // Geometric-ish pressing counts with a long tail.
    let pressings = 1;
    if (hasMaster) while (rng() < 0.55 && pressings < 60) pressings++;
    const tracks = Array.from({ length: 2 + Math.floor(rng() * 9) }, () => phrase(rng, 1, 3));
    const master: MasterState = {
      id: masterId++,
      artist: phrase(rng, 1, 2),
      artistId: artistId++,
      title: phrase(rng, 1, 4),
      genre,
      styles: stylesFor(rng, genre),
      year: year(rng),
      videos: [],
      tracks,
    };
    for (let p = 0; p < pressings && releaseId <= count; p++) {
      const id = releaseId++;
      const country = pickWeighted(rng, COUNTRY_WEIGHTS);
      const fmt = pickWeighted(rng, FORMATS);
      const descriptions = [pick(rng, fmt.descriptions)];
      if (rng() < 0.06) descriptions.push(pick(rng, RARE_DESCRIPTIONS));
      const relYear = master.year + (p === 0 ? 0 : Math.floor(rng() * 25));
      const label = rng() < 0.7 ? 1 + Math.floor(rng() * Math.max(1, labelId)) : labelId++;
      const linked = rng() < 0.3;
      const videos: string[] = [];
      if (linked) {
        const n = pickWeighted(rng, [
          [1, 45],
          [2, 25],
          [3, 15],
          [4, 8],
          [5, 7],
        ] as const);
        for (let v = 0; v < n; v++) {
          if (master.videos.length > 0 && rng() < 0.5) videos.push(pick(rng, master.videos));
          else {
            const vid = videoId(rng);
            master.videos.push(vid);
            videos.push(vid);
          }
        }
      }
      let xml = `<release id="${id}" status="Accepted"><artists><artist><id>${master.artistId}</id><name>${esc(master.artist)}</name><anv></anv><join></join><role></role><tracks></tracks></artist></artists>`;
      xml += `<title>${esc(master.title)}</title><labels><label name="Label ${label}" catno="CAT-${id}" id="${label}"/></labels>`;
      xml += `<formats><format name="${fmt.name}" qty="1" text=""><descriptions>${descriptions.map((d) => `<description>${esc(d)}</description>`).join("")}</descriptions></format></formats>`;
      xml += `<genres><genre>${esc(genre)}</genre></genres><styles>${master.styles.map((s) => `<style>${esc(s)}</style>`).join("")}</styles>`;
      xml += `<country>${esc(country)}</country><released>${relYear}-00-00</released>`;
      if (hasMaster) xml += `<master_id is_main_release="${p === 0}">${master.id}</master_id>`;
      xml += `<tracklist>${master.tracks.map((t, i) => `<track><position>${String.fromCharCode(65 + Math.floor(i / 4))}${(i % 4) + 1}</position><title>${esc(t)}</title><duration>${2 + Math.floor(rng() * 6)}:${String(Math.floor(rng() * 60)).padStart(2, "0")}</duration></track>`).join("")}</tracklist>`;
      if (videos.length > 0) {
        xml += "<videos>";
        for (const vid of new Set(videos)) {
          const track = pick(rng, master.tracks);
          const title = rng() < 0.7 ? `${master.artist} - ${track}` : phrase(rng, 2, 5);
          xml += `<video src="https://www.youtube.com/watch?v=${vid}" duration="${120 + Math.floor(rng() * 400)}" embed="${rng() < 0.03 ? "false" : "true"}"><title>${esc(title)}</title><description></description></video>`;
        }
        xml += "</videos>";
      }
      xml += "</release>\n";
      yield xml;
    }
  }
  yield "</releases>\n";
}

export async function generateDump(options: {
  releases: number;
  out: string;
  seed: number;
}): Promise<void> {
  await mkdir(dirname(options.out), { recursive: true });
  const rng = seededRng(options.seed);
  const source = Readable.from(releasesXml(options.releases, rng));
  const sink = createWriteStream(options.out);
  if (options.out.endsWith(".gz")) await pipeline(source, createGzip({ level: 6 }), sink);
  else await pipeline(source, sink);
}
