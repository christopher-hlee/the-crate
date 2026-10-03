// YouTube URL → video ID. Hand-rolled instead of `new URL()` so it behaves the same in
// Node, browsers and React Native (whose URL polyfill lacks most getters).

export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
const URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i;
const PATH_FORMS = ["/embed/", "/shorts/"];

export function isVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

function hostOf(authority: string): string {
  const withoutUser = authority.slice(authority.lastIndexOf("@") + 1);
  const host = withoutUser.replace(/:\d+$/, "").toLowerCase().replace(/\.$/, "");
  return host.replace(/^(?:www|m|music)\./, "");
}

function queryParam(query: string | undefined, name: string): string | null {
  if (!query) return null;
  for (const part of query.slice(1).split("&")) {
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    if (key !== name) continue;
    const raw = eq === -1 ? "" : part.slice(eq + 1);
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      return null;
    }
  }
  return null;
}

function firstSegment(rest: string): string {
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

/**
 * Extracts the 11-character video ID from a YouTube link. Accepts `watch?v=`,
 * `youtu.be/`, `embed/` and `shorts/` forms on youtube.com, its www/m/music subdomains,
 * youtube-nocookie.com and youtu.be. Returns null for any other host or shape.
 */
export function extractYouTubeId(input: string): string | null {
  let url = input.trim();
  if (url === "") return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith("//")) url = `https://${url}`;
  const m = URL_PATTERN.exec(url);
  if (!m) return null;
  const host = hostOf(m[1] ?? "");
  const path = m[2] ?? "";
  const query = m[3];

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = firstSegment(path.replace(/^\/+/, ""));
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (path === "/watch" || path === "/watch/") {
      candidate = queryParam(query, "v");
    } else {
      for (const prefix of PATH_FORMS) {
        if (path.startsWith(prefix)) {
          candidate = firstSegment(path.slice(prefix.length));
          break;
        }
      }
    }
  }
  return candidate !== null && isVideoId(candidate) ? candidate : null;
}

/** A watch URL, optionally starting at a timestamp (used in crate sheets). */
export function youtubeWatchUrl(videoId: string, startSeconds?: number | null): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (startSeconds === undefined || startSeconds === null || startSeconds <= 0) return base;
  return `${base}&t=${Math.floor(startSeconds)}s`;
}
