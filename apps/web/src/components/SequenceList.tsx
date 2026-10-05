"use client";

import { ApiError, type CatalogItem, type SequenceResponse } from "@app/api-client";
import { useEffect, useState } from "react";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { Button } from "@/components/ui/button";

const keyOf = (i: CatalogItem) => `${i.recordKey}/${i.videoId}`;

/** A seeded order, paged 50 at a time, played with the list's one player. */
export function SequenceList({
  load,
  emptyText,
  hearts = true,
}: {
  load: (page: number) => Promise<SequenceResponse>;
  emptyText?: string;
  hearts?: boolean;
}) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(null);
    setError(null);
    setPage(0);
    load(0)
      .then((r) => {
        setItems(r.items);
        setHasMore(r.hasMore);
      })
      .catch(() => setError("Couldn't load the sequence."));
  }, [load]);

  if (error) return <p className="text-warn">{error}</p>;
  if (!items) return <p className="text-ink-2">Loading…</p>;
  const withTempo = items.filter((i) => i.record?.tempo).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-2" data-testid="sequence-coverage">
        Tempo known for {withTempo} of {items.length} shown.
      </p>
      <ItemListPlayer items={items} emptyText={emptyText} hearts={hearts} />
      {hasMore && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMoreError(null);
            try {
              const next = await load(page + 1);
              const have = new Set(items.map(keyOf));
              const fresh = next.items.filter((i) => !have.has(keyOf(i)));
              setItems([...items, ...fresh]);
              // A page with nothing new means the order has run out here.
              setHasMore(next.hasMore && fresh.length > 0);
              setPage(page + 1);
            } catch (err) {
              setMoreError(err instanceof ApiError ? err.message : "Couldn't load more.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Load more
        </Button>
      )}
      {moreError && (
        <p role="alert" className="text-sm text-warn">
          {moreError}
        </p>
      )}
    </div>
  );
}
