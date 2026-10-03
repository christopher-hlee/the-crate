import { describe, expect, it } from "vitest";
import { extractYouTubeId, isVideoId, youtubeWatchUrl } from "./youtube-links";

const ID = "aB3_-dE9xYz";

describe("extractYouTubeId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `http://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RD123`,
    `www.youtube.com/watch?v=${ID}`,
    `//www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=10`,
    `https://www.youtube.com/embed/${ID}?rel=0`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://WWW.YOUTUBE.COM/watch?v=${ID}`,
    `https://www.youtube.com:443/watch?v=${ID}#frag`,
    `  https://www.youtube.com/watch?v=${ID}  `,
  ])("extracts the ID from %s", (url) => {
    expect(extractYouTubeId(url)).toBe(ID);
  });

  it.each([
    "",
    "not a url",
    `https://vimeo.com/${ID}`,
    `https://www.youtube.com.evil.example/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=tooShort",
    `https://www.youtube.com/watch?v=${ID}X`,
    `https://www.youtube.com/watch?list=${ID}`,
    `https://www.youtube.com/channel/${ID}`,
    `https://www.youtube.com/playlist?list=${ID}`,
    `https://youtu.be/`,
    `https://www.youtube.com/embed/${ID}extra`,
    `https://youtu.be.example.com/${ID}`,
  ])("rejects %s", (url) => {
    expect(extractYouTubeId(url)).toBeNull();
  });

  it("validates IDs strictly", () => {
    expect(isVideoId(ID)).toBe(true);
    expect(isVideoId("abc")).toBe(false);
    expect(isVideoId("abcdefghij!")).toBe(false);
  });
});

describe("youtubeWatchUrl", () => {
  it("adds a whole-second timestamp when one is given", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeWatchUrl(ID, 0)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeWatchUrl(ID, 95.7)).toBe(`https://www.youtube.com/watch?v=${ID}&t=95s`);
  });
});
