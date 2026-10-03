"use client";

import type { RecordDetail, ShufflePick } from "@app/api-client";
import { formatDuration } from "@app/core";
import { ExternalLink } from "lucide-react";
import { Sleeve } from "@/components/Sleeve";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

type Props = {
  pick: ShufflePick;
  detail: RecordDetail | null;
  onScope?: (scope: { labelId?: number; artistId?: number }) => void;
  canScope: boolean;
};

/** Artist, title, label and catalog number, year, country, styles, tracklist, links. */
export function RecordPanel({ pick, detail, onScope, canScope }: Props) {
  const r = pick.record;
  const playing = pick.track?.position;
  const label = detail?.labels[0];
  const artist = detail?.artists.find((a) => a.id !== null);
  return (
    <article className="flex flex-col gap-4 sm:flex-row" data-testid="record-panel">
      <Sleeve label={r.label} catno={r.catno} year={r.year} styles={r.styles} size={144} />
      <div className="min-w-0 flex-1 space-y-3">
        <header>
          <p className="text-sm text-ink-2">{r.artist}</p>
          <h2 className="text-xl font-semibold leading-tight">{r.title}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {[r.label && `${r.label}${r.catno ? ` · ${r.catno}` : ""}`, r.year, r.country]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {r.styles.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
          {pick.tempo && (
            <Badge title={`Tempo source: ${pick.tempo.source}`}>
              {Math.round(pick.tempo.bpm)} BPM
              {pick.tempo.camelotKey ? ` · ${pick.tempo.camelotKey}` : ""}
              {pick.tempo.source === "getsongbpm" && (
                <a
                  href="https://getsongbpm.com"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  via GetSongBPM
                </a>
              )}
              {pick.tempo.source === "community" && <span>· listener votes</span>}
            </Badge>
          )}
        </div>
        {detail && detail.tracklist.length > 0 && (
          <ol className="divide-y divide-line rounded-md border border-line text-sm">
            {detail.tracklist.map((t, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: positions repeat or are empty on headings
                key={`${t.position}-${i}`}
                className={cn(
                  "flex items-baseline gap-3 px-3 py-1.5",
                  t.position && t.position === playing && "bg-surface-2 font-medium text-accent",
                  !t.position && "text-xs uppercase tracking-wider text-ink-2",
                )}
                aria-current={t.position && t.position === playing ? "true" : undefined}
              >
                <span className="w-10 shrink-0 tabular-nums text-ink-2">{t.position}</span>
                <span className="flex-1">{t.title}</span>
                {t.durationS !== null && (
                  <span className="tabular-nums text-ink-2">{formatDuration(t.durationS)}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <a
            href={r.discogsUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-accent underline"
          >
            View on Discogs <ExternalLink size={14} aria-hidden />
          </a>
          <a
            href={`https://www.youtube.com/watch?v=${pick.videoId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-ink-2 underline"
          >
            Video on YouTube <ExternalLink size={14} aria-hidden />
          </a>
          {canScope && onScope && label?.id && (
            <button
              type="button"
              className="text-ink-2 underline"
              onClick={() => onScope({ labelId: label.id ?? undefined })}
            >
              More from {label.name}
            </button>
          )}
          {canScope && onScope && artist?.id && (
            <button
              type="button"
              className="text-ink-2 underline"
              onClick={() => onScope({ artistId: artist.id ?? undefined })}
            >
              More from {artist.name}
            </button>
          )}
        </div>
        {detail && detail.pressings > 1 && (
          <p className="text-xs text-ink-2">
            {detail.pressings} pressings on Discogs · {detail.videos.length} playable video
            {detail.videos.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </article>
  );
}
