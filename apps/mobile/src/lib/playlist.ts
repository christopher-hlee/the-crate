// "Open in YouTube": a list becomes one or more youtube.com links (50 videos each). Plain links,
// opened in YouTube's own app or site; nothing is fetched into this app.

import { isVideoId, YOUTUBE_PLAYLIST_MAX, youtubePlaylistUrls } from "@app/core";

export type PlaylistPart = { label: string; url: string; count: number };

/** Button label for chunk `index` of `total`. */
export function partLabel(index: number, total: number): string {
  return total === 1 ? "Open in YouTube" : `Part ${index + 1}`;
}

/** One part per 50 playable videos, in list order, labelled "Part 1", "Part 2"… */
export function playlistParts(items: readonly { videoId: string; available: boolean }[]) {
  const ids = [
    ...new Set(items.filter((i) => i.available && isVideoId(i.videoId)).map((i) => i.videoId)),
  ];
  const urls = youtubePlaylistUrls(ids);
  return urls.map(
    (url, i): PlaylistPart => ({
      label: partLabel(i, urls.length),
      url,
      count: Math.min(YOUTUBE_PLAYLIST_MAX, ids.length - i * YOUTUBE_PLAYLIST_MAX),
    }),
  );
}
