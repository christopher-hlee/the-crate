"use client";

import { ApiError, type HistoryResponse } from "@app/api-client";
import { useEffect, useState } from "react";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

const message = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

export default function HistoryPage() {
  const { me, loading } = useViewer();
  const userId = me?.user.id ?? null;
  const [pages, setPages] = useState<HistoryResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** Bumped after clearing, so the list (and its player) starts over. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .history()
      .then((h) => {
        if (!cancelled) setPages([h]);
      })
      .catch((err) => {
        if (cancelled) return;
        setPages([]);
        setError(message(err, "Couldn't load your history."));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return null;
  if (!me) return <SignInPrompt what="keep a listening history" />;
  const items = pages.flatMap((p) => p.items);
  const last = pages[pages.length - 1];

  const loadMore = async () => {
    if (!last?.nextCursor) return;
    setBusy(true);
    setError(null);
    try {
      const more = await api.history(last.nextCursor);
      setPages((p) => [...p, more]);
    } catch (err) {
      setError(message(err, "Couldn't load more history."));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.clearHistory();
      setPages(last ? [{ items: [], nextCursor: null, window: last.window }] : []);
      setGeneration((g) => g + 1);
      setConfirming(false);
    } catch (err) {
      setError(message(err, "Couldn't clear your history."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          {last && (
            <p className="text-sm text-ink-2">
              Your last {last.window.toLocaleString("en-US")} plays. Played records stay out of your
              shuffle.
            </p>
          )}
        </div>
        {items.length > 0 &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              Clear your whole history? Played records come back into your shuffle.
              <Button variant="danger" size="sm" disabled={busy} onClick={() => void clear()}>
                Clear
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Clear history
            </Button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <ItemListPlayer
        key={generation}
        items={items}
        hearts
        emptyText="Nothing played yet. A play counts after 5 seconds."
      />
      {last?.nextCursor && (
        <Button disabled={busy} onClick={() => void loadMore()}>
          Load more
        </Button>
      )}
    </div>
  );
}
