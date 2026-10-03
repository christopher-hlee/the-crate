"use client";

import type { CatalogItem, SequenceResponse } from "@app/api-client";
import { useEffect, useState } from "react";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { Button } from "@/components/ui/button";

/** A seeded order, paged 50 at a time, played with the list's one player. */
export function SequenceList({
  load,
  emptyText,
}: {
  load: (page: number) => Promise<SequenceResponse>;
  emptyText?: string;
}) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      <ItemListPlayer items={items} emptyText={emptyText} />
      {hasMore && (
        <Button
          onClick={async () => {
            const next = await load(page + 1);
            setItems((cur) => [...(cur ?? []), ...next.items]);
            setHasMore(next.hasMore);
            setPage(page + 1);
          }}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
