// Matches a release's YouTube links to its tracks using the titles Discogs stores for each
// link. Normalize, score each (video, track) pair by title containment or token overlap with
// small boosts for the position and artist, then assign greedily, one video per track.

import { normalizeText, tokenize } from "./text";

export type MatchTrack = { position: string; title: string; artists?: readonly string[] };
export type MatchVideo = { videoId: string; title: string };
export type TrackMatch = { videoId: string; trackIndex: number; score: number };

export const MATCH_THRESHOLD = 0.6;
const POSITION_BOOST = 0.1;
const ARTIST_BOOST = 0.05;

/** Words that say nothing about which track a video is. */
const NOISE = new Set([
  "official",
  "video",
  "audio",
  "hq",
  "hd",
  "lyrics",
  "lyric",
  "remastered",
  "remaster",
  "full",
  "album",
  "vinyl",
  "rip",
  "version",
  "original",
  "mix",
  "feat",
  "ft",
  "featuring",
  "the",
  "a",
  "and",
  "of",
  "1080p",
  "720p",
  "4k",
  "promo",
  "clip",
  "music",
  "live",
  "single",
  "ep",
  "lp",
]);

function meaningful(tokens: string[]): string[] {
  return tokens.filter((t) => !NOISE.has(t) && !/^(19|20)\d\d$/.test(t));
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (needle === "") return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/** "Full album" uploads cover the whole record, not one track. */
export function isWholeRecordUpload(videoTitle: string): boolean {
  return /\bfull (album|ep|lp|record)\b|\bcomplete album\b/.test(normalizeText(videoTitle));
}

/**
 * Score for how well a video title names a track. Recall is the share of the track title's
 * words found in the video title (1 when the whole title appears as a phrase); precision is
 * the share of the video title's own words, minus artist names and noise, found in the track
 * title. Precision breaks ties between "Track" and "Track (X Remix)".
 */
export function scoreMatch(videoTitle: string, track: MatchTrack, releaseArtist = ""): number {
  const v = normalizeText(videoTitle);
  const t = normalizeText(track.title);
  if (v === "" || t === "") return 0;
  const tTokens = meaningful(tokenize(track.title));
  if (tTokens.length === 0) return 0;
  const tSet = new Set(tTokens);
  const vTokenList = tokenize(videoTitle);
  const vTokens = new Set(vTokenList);

  let recall: number;
  if (t.length >= 3 && containsPhrase(v, t)) {
    recall = 1;
  } else {
    const hits = tTokens.filter((tok) => vTokens.has(tok)).length;
    recall = hits / tTokens.length;
    // A single shared word in a long title is weak evidence.
    if (hits === 1 && tTokens.length >= 3) recall *= 0.5;
  }
  if (recall === 0) return 0;

  const artists = [...(track.artists ?? []), releaseArtist]
    .map(normalizeText)
    .filter((a) => a.length >= 2);
  const artistTokens = new Set(artists.flatMap((a) => a.split(" ")));
  const pos = normalizeText(track.position);
  const own = meaningful(vTokenList).filter((tok) => !artistTokens.has(tok) && tok !== pos);
  const precision = own.length === 0 ? 1 : own.filter((tok) => tSet.has(tok)).length / own.length;

  let score = recall * (0.6 + 0.4 * precision);
  if (/[a-z]/.test(pos) && vTokens.has(pos)) score += POSITION_BOOST;
  if (artists.some((a) => containsPhrase(v, a))) score += ARTIST_BOOST;
  return score;
}

/**
 * Assigns videos to tracks, at most one video per track and one track per video. Tracks
 * without a position (headings) never match, since features are keyed by position.
 */
export function matchVideosToTracks(
  videos: readonly MatchVideo[],
  tracks: readonly MatchTrack[],
  releaseArtist = "",
  threshold = MATCH_THRESHOLD,
): TrackMatch[] {
  const candidates = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.position.trim() !== "" && track.title.trim() !== "");
  if (candidates.length === 0 || videos.length === 0) return [];

  // A release with one positioned track: a link on it is almost surely that track.
  if (
    candidates.length === 1 &&
    videos.length === 1 &&
    !isWholeRecordUpload(videos[0]?.title ?? "")
  ) {
    const only = candidates[0] as { track: MatchTrack; index: number };
    const video = videos[0] as MatchVideo;
    return [
      {
        videoId: video.videoId,
        trackIndex: only.index,
        score: scoreMatch(video.title, only.track, releaseArtist),
      },
    ];
  }

  const pairs: { v: number; c: number; score: number; len: number }[] = [];
  videos.forEach((video, v) => {
    if (isWholeRecordUpload(video.title)) return;
    candidates.forEach(({ track }, c) => {
      const score = scoreMatch(video.title, track, releaseArtist);
      if (score >= threshold) pairs.push({ v, c, score, len: normalizeText(track.title).length });
    });
  });
  // Best score first; on ties prefer the longer (more specific) title, then link order.
  pairs.sort((a, b) => b.score - a.score || b.len - a.len || a.v - b.v || a.c - b.c);

  const usedVideos = new Set<number>();
  const usedTracks = new Set<number>();
  const out: TrackMatch[] = [];
  for (const p of pairs) {
    if (usedVideos.has(p.v) || usedTracks.has(p.c)) continue;
    usedVideos.add(p.v);
    usedTracks.add(p.c);
    const cand = candidates[p.c] as { index: number };
    out.push({
      videoId: (videos[p.v] as MatchVideo).videoId,
      trackIndex: cand.index,
      score: Math.round(p.score * 1000) / 1000,
    });
  }
  return out.sort((a, b) => a.trackIndex - b.trackIndex);
}
