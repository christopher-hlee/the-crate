"use client";

import { ApiError, type FavoriteItem } from "@app/api-client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFavoriteStore } from "@/components/FavoriteButton";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { ItemNote } from "@/components/ItemNote";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { YouTubePlaylistLinks } from "@/components/YouTubePlaylistLinks";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

type Ref = { recordKey: string; videoId: string };
const keyOf = (i: Ref) => `${i.recordKey}/${i.videoId}`;
const refOf = (i: Ref): Ref => ({ recordKey: i.recordKey, videoId: i.videoId });
const message = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const nameOf = (i: FavoriteItem) =>
  i.record ? `${i.record.artist} – ${i.record.title}` : i.recordKey;

export default function FavoritesPage() {
  const { me, loading } = useViewer();
  const userId = me?.user.id ?? null;
  const [store] = useState(() => createFavoriteStore());
  const [items, setItems] = useState<FavoriteItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [max, setMax] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Rows hearted off on this visit. They stay in place so the heart can put them back. */
  const [unfavorited, setUnfavorited] = useState<ReadonlySet<string>>(() => new Set());
  /** Net removals since the last page load. The cursor is an offset, so they shift it back. */
  const removedSince = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .favorites()
      .then((r) => {
        if (cancelled) return;
        store.set(r.items, true);
        removedSince.current = 0;
        setItems(r.items);
        setCursor(r.nextCursor);
        setTotal(r.total);
        setMax(r.max);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setError(message(err, "Couldn't load your favorites."));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, store]);

  const videoIds = useMemo(
    () =>
      (items ?? []).filter((i) => i.available && !unfavorited.has(keyOf(i))).map((i) => i.videoId),
    [items, unfavorited],
  );

  if (loading) return null;
  if (!me) return <SignInPrompt what="keep favorites: they're free" />;

  const loadMore = async () => {
    if (!cursor) return;
    setBusy(true);
    setError(null);
    try {
      const offset = Number.parseInt(cursor, 10);
      const r = await api.favorites(
        Number.isNaN(offset) ? cursor : String(Math.max(0, offset - removedSince.current)),
      );
      removedSince.current = 0;
      store.set(r.items, true);
      // Shifted offsets can repeat a few rows; keep each once.
      const have = new Set((items ?? []).map(keyOf));
      setItems([...(items ?? []), ...r.items.filter((i) => !have.has(keyOf(i)))]);
      setCursor(r.nextCursor);
      setTotal(r.total);
    } catch (err) {
      setError(message(err, "Couldn't load more favorites."));
    } finally {
      setBusy(false);
    }
  };

  const onFavoriteChange = async (item: FavoriteItem, favorited: boolean, newTotal: number) => {
    const key = keyOf(item);
    setTotal(newTotal);
    setUnfavorited((cur) => {
      const next = new Set(cur);
      if (favorited) next.delete(key);
      else next.add(key);
      return next;
    });
    // Removing a favorite drops its stored note; hearting it again restores the note.
    removedSince.current = Math.max(0, removedSince.current + (favorited ? -1 : 1));
    if (favorited && item.note) {
      try {
        await api.setFavoriteNote(refOf(item), item.note);
      } catch (err) {
        setError(message(err, "Couldn't restore the note."));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Favorites</h1>
        <p className="text-sm text-ink-2">
          <span data-testid="favorites-count">
            {total.toLocaleString("en-US")} of {max.toLocaleString("en-US")}
          </span>{" "}
          favorites. Free for everyone signed in: heart any record to keep it here.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      {items === null ? (
        <p className="text-ink-2">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-2">
          No favorites yet. Press the heart on the{" "}
          <Link href="/" className="text-accent underline">
            Dig screen
          </Link>{" "}
          (or F) to keep a record here.
        </p>
      ) : (
        <>
          <YouTubePlaylistLinks videoIds={videoIds} />
          <ItemListPlayer
            items={items}
            hearts
            favoriteStore={store}
            onFavoriteChange={(item, favorited, newTotal) =>
              void onFavoriteChange(item, favorited, newTotal)
            }
            details={(item) =>
              unfavorited.has(keyOf(item)) ? (
                <p className="text-sm text-ink-2">
                  Removed from favorites. Press the heart to keep it.
                </p>
              ) : (
                <ItemNote
                  note={item.note}
                  label={`Note on ${nameOf(item)}`}
                  save={async (note) => {
                    await api.setFavoriteNote(refOf(item), note);
                    setItems((cur) =>
                      (cur ?? []).map((i) => (keyOf(i) === keyOf(item) ? { ...i, note } : i)),
                    );
                  }}
                />
              )
            }
          />
          {cursor && (
            <Button disabled={busy} onClick={() => void loadMore()}>
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
