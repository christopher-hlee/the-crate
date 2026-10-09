"use client";

import type { BlockedCommenter } from "@app/api-client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { failureMessage } from "@/lib/comment-errors";

/** Commenters this account blocked from its comment lists, each with Unblock. */
export function BlockedCommenters() {
  const [items, setItems] = useState<BlockedCommenter[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger
  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    api
      .blockedCommenters()
      .then((r) => live && setItems(r.items))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const unblock = async (b: BlockedCommenter) => {
    setError(null);
    setPending(b.id);
    try {
      await api.unblockCommenter(b.id);
      setItems((all) => all?.filter((x) => x.id !== b.id) ?? null);
    } catch (err) {
      setError(failureMessage(err, `Couldn't unblock ${b.displayName}. Try again.`));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="space-y-3" data-testid="blocked-commenters">
      <div>
        <h2 className="font-semibold">Blocked commenters</h2>
        <p className="text-sm text-ink-2">
          You don&apos;t see comments from people you block. They aren&apos;t told.
        </p>
      </div>
      {loadFailed ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          Couldn&apos;t load the list.
          <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </p>
      ) : items?.length === 0 ? (
        <p className="text-sm text-ink-2">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items?.map((b) => (
            <li key={b.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1 font-medium">{b.displayName}</span>
              <span className="text-xs text-ink-2">
                since {new Date(b.blockedAt).toLocaleDateString()}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pending === b.id}
                aria-label={`Unblock ${b.displayName}`}
                onClick={() => void unblock(b)}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </Card>
  );
}
