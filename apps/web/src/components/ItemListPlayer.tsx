"use client";

import type { CatalogItem } from "@app/api-client";
import { ExternalLink, Play } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Player, type PlayerRequest } from "@/components/Player";
import { Sleeve } from "@/components/Sleeve";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Props = {
  items: CatalogItem[];
  /** Extra controls per row (reorder, remove). */
  actions?: (item: CatalogItem, index: number) => ReactNode;
  emptyText?: string;
};

/**
 * One player for a list of saved records. Rows start playback on click; the first playable
 * row is cued (not played) when the page opens.
 */
export function ItemListPlayer({ items, actions, emptyText = "Nothing here yet." }: Props) {
  const first = items.find((i) => i.available);
  const [request, setRequest] = useState<PlayerRequest | null>(
    first ? { videoId: first.videoId, token: 0, play: false } : null,
  );
  const [current, setCurrent] = useState<string | null>(
    first ? `${first.recordKey}/${first.videoId}` : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef(0);

  // Lists that load after mount (history pages) cue their first playable item then.
  useEffect(() => {
    if (request || !first) return;
    setRequest({ videoId: first.videoId, token: 0, play: false });
    setCurrent(`${first.recordKey}/${first.videoId}`);
  }, [request, first]);

  const play = useCallback((item: CatalogItem) => {
    token.current += 1;
    setCurrent(`${item.recordKey}/${item.videoId}`);
    setRequest({ videoId: item.videoId, token: token.current, play: true });
    setNotice(null);
  }, []);

  const currentItem = items.find((i) => `${i.recordKey}/${i.videoId}` === current);

  return (
    <div className="space-y-4">
      {request ? (
        <div className="max-w-3xl">
          <Player
            request={request}
            title={
              currentItem?.record
                ? `${currentItem.record.artist} – ${currentItem.record.title}`
                : undefined
            }
            onUnplayable={(videoId, code) => {
              void api.report(videoId, code).catch(() => undefined);
              setNotice(
                "That video can't play here right now. It has been reported for a recheck.",
              );
            }}
            onPlayLogged={(videoId, seconds) => {
              if (currentItem)
                void api
                  .logPlay({ recordKey: currentItem.recordKey, videoId, seconds })
                  .catch(() => undefined);
            }}
          />
        </div>
      ) : null}
      {notice && (
        <p role="status" className="text-sm text-warn">
          {notice}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-ink-2">{emptyText}</p>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((item, i) => {
            const key = `${item.recordKey}/${item.videoId}`;
            const r = item.record;
            return (
              <li
                key={key}
                className={cn("flex items-center gap-3 p-3", key === current && "bg-surface-2")}
                data-testid="item-row"
              >
                <Sleeve
                  size={48}
                  label={r?.label}
                  catno={r?.catno}
                  year={r?.year}
                  styles={r?.styles}
                />
                <button
                  type="button"
                  disabled={!item.available}
                  onClick={() => play(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                >
                  <Play
                    size={16}
                    aria-hidden
                    className={cn("shrink-0", item.available ? "text-accent" : "text-ink-2")}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {r ? `${r.artist} – ${r.title}` : "Record no longer in the catalog"}
                    </span>
                    <span className="block truncate text-xs text-ink-2">
                      {r
                        ? [
                            r.track && `${r.track.position}. ${r.track.title}`,
                            r.label,
                            r.year,
                            r.country,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : item.recordKey}
                      {!item.available && " · not available right now"}
                    </span>
                  </span>
                </button>
                <a
                  href={item.discogsUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-ink-2 hover:text-ink"
                  aria-label="View on Discogs"
                >
                  <ExternalLink size={16} />
                </a>
                {actions?.(item, i)}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
