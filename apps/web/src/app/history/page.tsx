"use client";

import type { HistoryResponse } from "@app/api-client";
import { useEffect, useState } from "react";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

export default function HistoryPage() {
  const { me, loading } = useViewer();
  const [pages, setPages] = useState<HistoryResponse[]>([]);

  useEffect(() => {
    if (!me) return;
    api
      .history()
      .then((h) => setPages([h]))
      .catch(() => setPages([]));
  }, [me]);

  if (loading) return null;
  if (!me) return <SignInPrompt what="keep a listening history" />;
  const items = pages.flatMap((p) => p.items);
  const last = pages[pages.length - 1];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        {last && (
          <p className="text-sm text-ink-2">
            Your last {last.window.toLocaleString("en-US")} plays. Played records stay out of your
            shuffle.
          </p>
        )}
      </div>
      <ItemListPlayer
        items={items}
        emptyText="Nothing played yet. A play counts after 5 seconds."
      />
      {last?.nextCursor && (
        <Button
          onClick={async () => {
            const more = await api.history(last.nextCursor);
            setPages((p) => [...p, more]);
          }}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
