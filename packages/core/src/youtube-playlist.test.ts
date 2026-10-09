import { describe, expect, it } from "vitest";
import { YOUTUBE_PLAYLIST_MAX, youtubePlaylistUrls } from "./youtube-playlist";

const id = (n: number) => `vid${String(n).padStart(8, "0")}`;

describe("youtubePlaylistUrls", () => {
  it("chunks into links of 50 IDs, deduplicated, in order", () => {
    const ids = Array.from({ length: 120 }, (_, i) => id(i));
    const urls = youtubePlaylistUrls([...ids, id(0), "not valid!"]);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(
      `https://www.youtube.com/watch_videos?video_ids=${ids.slice(0, 50).join(",")}`,
    );
    expect(urls[2]?.split("=")[1]?.split(",")).toHaveLength(20);
    expect(YOUTUBE_PLAYLIST_MAX).toBe(50);
  });

  it("returns nothing for an empty list", () => {
    expect(youtubePlaylistUrls([])).toEqual([]);
  });
});
