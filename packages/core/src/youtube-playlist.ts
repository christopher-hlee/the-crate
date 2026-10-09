// Opening a list as a YouTube playlist without the API: YouTube's own watch_videos page plays
// up to 50 IDs as a temporary, untitled playlist the viewer can save in their YouTube account.
// It's a plain link to youtube.com: no API call, no quota, nothing fetched into the app.

import { isVideoId } from "./youtube-links";

export const YOUTUBE_PLAYLIST_MAX = 50;

/** One link per 50 videos, in order, skipping duplicates and invalid IDs. */
export function youtubePlaylistUrls(videoIds: readonly string[]): string[] {
  const ids = [...new Set(videoIds.filter(isVideoId))];
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += YOUTUBE_PLAYLIST_MAX) {
    out.push(
      `https://www.youtube.com/watch_videos?video_ids=${ids.slice(i, i + YOUTUBE_PLAYLIST_MAX).join(",")}`,
    );
  }
  return out;
}
