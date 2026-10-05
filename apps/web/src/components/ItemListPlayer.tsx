"use client";

import type { CatalogItem } from "@app/api-client";
import { ExternalLink, ListMusic, Play } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  createFavoriteStore,
  FavoriteButton,
  type FavoriteStore,
  FavoriteStoreProvider,
} from "@/components/FavoriteButton";
import { Player, type PlayerRequest } from "@/components/Player";
import { Sleeve } from "@/components/Sleeve";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Props<T extends CatalogItem> = {
  items: T[];
  /** Extra controls per row (reorder, remove). */
  actions?: (item: T, index: number) => ReactNode;
  /** Inline content under a row, such as a note field. It never overlaps the player. */
  details?: (item: T, index: number) => ReactNode;
  emptyText?: string;
  /** A favorite heart on each row. */
  hearts?: boolean;
  /** The hearts' status store, when the page already knows some statuses. */
  favoriteStore?: FavoriteStore;
  onFavoriteChange?: (item: T, favorited: boolean, total: number) => void;
};

type Current = { key: string; index: number };

const keyOf = (i: CatalogItem) => `${i.recordKey}/${i.videoId}`;
const UNPLAYABLE = "That video can't play here right now. It has been reported for a recheck.";

/**
 * One player for a list of records. Rows start playback on click; the first playable row is
 * cued (not played) when the page opens. When a video ends, the next playable row loads; it
 * starts only while more than half of the player is visible (the Player enforces that).
 * Listening is free on every plan, including Play all.
 */
export function ItemListPlayer<T extends CatalogItem>({
  items,
  actions,
  details,
  emptyText = "Nothing here yet.",
  hearts = false,
  favoriteStore,
  onFavoriteChange,
}: Props<T>) {
  const firstIndex = items.findIndex((i) => i.available);
  const first = items[firstIndex];
  const [request, setRequest] = useState<PlayerRequest | null>(
    first ? { videoId: first.videoId, token: 0, play: false } : null,
  );
  const [current, setCurrent] = useState<Current | null>(
    first ? { key: keyOf(first), index: firstIndex } : null,
  );
  /** Rows whose video failed to play this visit; Play all and auto-advance skip them. */
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef(0);
  const [ownStore] = useState(() => createFavoriteStore());
  const store = favoriteStore ?? ownStore;

  // Lists that load after mount (history pages) cue their first playable item then.
  useEffect(() => {
    if (request || !first) return;
    setRequest({ videoId: first.videoId, token: 0, play: false });
    setCurrent({ key: keyOf(first), index: firstIndex });
  }, [request, first, firstIndex]);

  // Row keys stay unique when a record appears twice (history).
  const rowKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return items.map((item) => {
      const k = keyOf(item);
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return n === 1 ? k : `${k}~${n}`;
    });
  }, [items]);

  /** Where the current row is now; -1 when it left the list. */
  const currentIndex = (() => {
    if (!current) return -1;
    if (items[current.index] && keyOf(items[current.index] as T) === current.key)
      return current.index;
    return items.findIndex((i) => keyOf(i) === current.key);
  })();
  const currentItem = currentIndex >= 0 ? items[currentIndex] : undefined;

  const nextPlayable = (after: number, skip: ReadonlySet<string>) => {
    for (let i = Math.max(0, after + 1); i < items.length; i++) {
      const item = items[i] as T;
      if (item.available && !skip.has(keyOf(item))) return i;
    }
    return -1;
  };

  /** The row to continue after: the current one, or the slot it left if it was removed. */
  const anchor = () => (currentIndex >= 0 ? currentIndex : (current?.index ?? 0) - 1);

  const playAt = (index: number, play: boolean) => {
    const item = items[index];
    if (!item) return;
    token.current += 1;
    setCurrent({ key: keyOf(item), index });
    setRequest({ videoId: item.videoId, token: token.current, play });
  };

  const firstPlayable = nextPlayable(-1, failed);

  return (
    <FavoriteStoreProvider value={store}>
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
                const skip = new Set(failed);
                if (currentItem && currentItem.videoId === videoId) skip.add(keyOf(currentItem));
                setFailed(skip);
                // Move on, keeping the user's intent: a cued row cues the next one.
                const next = nextPlayable(anchor(), skip);
                if (next >= 0) {
                  playAt(next, request.play);
                  setNotice(`${UNPLAYABLE} Moved on to the next record.`);
                } else {
                  setNotice(UNPLAYABLE);
                }
              }}
              onEnded={(videoId) => {
                if (currentItem && currentItem.videoId !== videoId) return;
                const next = nextPlayable(anchor(), failed);
                if (next >= 0) playAt(next, true);
              }}
              onPlayLogged={(videoId, seconds) => {
                if (currentItem && currentItem.videoId === videoId)
                  void api
                    .logPlay({ recordKey: currentItem.recordKey, videoId, seconds })
                    .catch(() => undefined);
              }}
            />
          </div>
        ) : null}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="primary"
              disabled={firstPlayable < 0}
              onClick={() => {
                setNotice(null);
                playAt(firstPlayable, true);
              }}
            >
              <ListMusic size={16} aria-hidden /> Play all
            </Button>
            <span className="text-xs text-ink-2">
              Plays the list in order; the next record starts when one ends.
            </span>
          </div>
        )}
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
              const r = item.record;
              const isCurrent = i === currentIndex;
              const name = r ? `${r.artist} – ${r.title}` : item.recordKey;
              const extra = details?.(item, i);
              return (
                <li
                  key={rowKeys[i]}
                  className={cn("p-3", isCurrent && "bg-surface-2")}
                  data-testid="item-row"
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
                      onClick={() => {
                        setNotice(null);
                        playAt(i, true);
                      }}
                      className="flex min-w-[9rem] flex-1 basis-0 items-center gap-3 text-left disabled:cursor-not-allowed"
                    >
                      <Play
                        size={16}
                        aria-hidden
                        className={cn("shrink-0", item.available ? "text-accent" : "text-ink-2")}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {r ? name : "Record no longer in the catalog"}
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
                          {item.available && failed.has(keyOf(item)) && " · couldn't play here"}
                        </span>
                      </span>
                    </button>
                    <span className="flex items-center gap-1">
                      {hearts && (
                        <FavoriteButton
                          item={item}
                          label={name}
                          onChange={(favorited, total) =>
                            onFavoriteChange?.(item, favorited, total)
                          }
                          onError={setNotice}
                        />
                      )}
                      <a
                        href={item.discogsUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:text-ink"
                        aria-label="View on Discogs"
                      >
                        <ExternalLink size={16} />
                      </a>
                      {actions?.(item, i)}
                    </span>
                  </div>
                  {extra ? <div className="mt-2 sm:pl-[60px]">{extra}</div> : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </FavoriteStoreProvider>
  );
}
