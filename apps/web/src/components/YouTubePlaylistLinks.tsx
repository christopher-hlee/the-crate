"use client";

import { youtubePlaylistUrls } from "@app/core";
import { ExternalLink, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useViewer } from "@/lib/viewer";

/**
 * "Open in YouTube": plain links to YouTube's own watch_videos page, one per 50 videos. No API
 * call, nothing fetched into the app. A Pro tool; playing the list here stays free.
 */
export function YouTubePlaylistLinks({ videoIds }: { videoIds: readonly string[] }) {
  const { me } = useViewer();
  const links = useMemo(() => {
    let start = 0;
    return youtubePlaylistUrls(videoIds).map((url) => {
      const count = (url.split("video_ids=")[1] ?? "").split(",").length;
      const range = { url, from: start + 1, to: start + count };
      start += count;
      return range;
    });
  }, [videoIds]);

  if (links.length === 0) return null;
  if (!me?.limits.youtubePlaylist) {
    return (
      <p
        className="flex items-center gap-1.5 text-sm text-ink-2"
        data-testid="youtube-links-locked"
      >
        <Lock size={14} aria-hidden /> Opening a list in YouTube as a playlist is a Pro tool.{" "}
        <Link href="/account" className="text-accent underline">
          Go Pro
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-1" data-testid="youtube-links">
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <ExternalLink size={14} aria-hidden />
            Open in YouTube ({l.from}–{l.to})
          </a>
        ))}
      </div>
      <p className="text-xs text-ink-2">
        YouTube opens each link as a temporary playlist of up to 50 videos, which you can save in
        your YouTube account.
      </p>
    </div>
  );
}
