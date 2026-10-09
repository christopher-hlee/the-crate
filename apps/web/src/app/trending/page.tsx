"use client";

import type { TrendingResponse } from "@app/api-client";
import { useEffect, useState } from "react";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { api } from "@/lib/api";

export default function TrendingPage() {
  const [data, setData] = useState<TrendingResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    document.title = "Trending";
    api
      .trending()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Trending</h1>
        <p className="text-sm text-ink-2">
          The records the most diggers favorited in the last {data?.days ?? 7} days. Free to play,
          like everything here.
        </p>
      </div>
      {failed ? (
        <p className="text-sm text-warn">Couldn't load trending records. Try again soon.</p>
      ) : data ? (
        <ItemListPlayer
          items={data.items}
          actions={(item) => {
            const fans = data.items.find(
              (i) => i.recordKey === item.recordKey && i.videoId === item.videoId,
            )?.fans;
            return fans ? (
              <span className="tabular-nums text-xs text-ink-2" data-testid="fans">
                {fans} fans
              </span>
            ) : null;
          }}
          emptyText="Nothing trending yet. Favorite records as you dig and they'll show up here."
        />
      ) : null}
    </div>
  );
}
