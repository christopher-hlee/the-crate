"use client";

import type { RecordDetail } from "@app/api-client";
import { Play } from "lucide-react";
import { useRef, useState } from "react";
import { Player, type PlayerRequest } from "@/components/Player";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/** The record page's one player and its playable videos. */
export function RecordVideos({
  record,
  initialVideo,
}: {
  record: RecordDetail;
  initialVideo?: string;
}) {
  const start = record.videos.find((v) => v.videoId === initialVideo) ?? record.videos[0];
  const [request, setRequest] = useState<PlayerRequest | null>(
    start ? { videoId: start.videoId, token: 0, play: false } : null,
  );
  const token = useRef(0);
  if (!request) return <p className="text-ink-2">No playable videos for this record right now.</p>;
  return (
    <div className="space-y-3">
      <div className="max-w-3xl">
        <Player
          request={request}
          title={`${record.artist} – ${record.title}`}
          onUnplayable={(videoId, code) => void api.report(videoId, code).catch(() => undefined)}
          onPlayLogged={(videoId, seconds) =>
            void api
              .logPlay({ recordKey: record.recordKey, videoId, seconds })
              .catch(() => undefined)
          }
        />
      </div>
      {record.videos.length > 1 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {record.videos.map((v, i) => (
            <li key={v.videoId}>
              <button
                type="button"
                onClick={() => {
                  token.current += 1;
                  setRequest({ videoId: v.videoId, token: token.current, play: true });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2",
                  request.videoId === v.videoId && "border-accent text-accent",
                )}
              >
                <Play size={14} aria-hidden />
                {v.track ? `${v.track.position}. ${v.track.title}` : `Video ${i + 1}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
