// Shapes produced by the streaming release parser. Every field is filled with a default
// when its element is missing: the current dumps leave out empty elements.

export type DiscogsArtist = { id: number | null; name: string; anv: string; join: string };

export type DiscogsLabel = { id: number | null; name: string; catno: string };

export type DiscogsFormat = { name: string; qty: string; text: string; descriptions: string[] };

export type DiscogsTrack = {
  position: string;
  title: string;
  durationS: number | null;
  artists: DiscogsArtist[];
};

export type DiscogsVideo = {
  src: string;
  /** null when the link is not a recognised YouTube URL. */
  videoId: string | null;
  /** Discogs' embed attribute. This is Discogs data, not YouTube API data. */
  embed: boolean;
  /** The title Discogs stores for the link. Used only for track matching. */
  title: string;
  durationS: number | null;
};

export type DiscogsRelease = {
  id: number;
  status: string;
  masterId: number | null;
  isMainRelease: boolean;
  title: string;
  artists: DiscogsArtist[];
  labels: DiscogsLabel[];
  released: string;
  year: number | null;
  country: string | null;
  genres: string[];
  styles: string[];
  formats: DiscogsFormat[];
  /** Flattened: index tracks are replaced by their sub-tracks. */
  tracklist: DiscogsTrack[];
  /** Every video link, deduplicated by URL; YouTube ones carry a videoId. */
  videos: DiscogsVideo[];
};

/** Unique YouTube video IDs on a release, in link order. */
export function youtubeVideos(release: DiscogsRelease): DiscogsVideo[] {
  const seen = new Set<string>();
  const out: DiscogsVideo[] = [];
  for (const v of release.videos) {
    if (v.videoId === null || seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    out.push(v);
  }
  return out;
}
