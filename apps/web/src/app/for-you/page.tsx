"use client";

import { ApiError, type ForYouResponse } from "@app/api-client";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SequenceList } from "@/components/SequenceList";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

/** "Deep House, Boogaloo and Fusion". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export default function ForYouPage() {
  const { me, loading } = useViewer();
  const userId = me?.user.id ?? null;
  const [head, setHead] = useState<ForYouResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headRef = useRef<ForYouResponse | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .forYou(0)
      .then((r) => {
        if (cancelled) return;
        headRef.current = r;
        setHead(r);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Couldn't load your picks.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Page 0 is already here; later pages come from the API.
  const load = useCallback(
    (page: number) =>
      page === 0 && headRef.current ? Promise.resolve(headRef.current) : api.forYou(page),
    [],
  );

  if (loading) return null;
  if (!me) return <SignInPrompt what="get picks for you" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">For you</h1>
        {head && head.basis.length > 0 && (
          <p className="text-sm text-ink-2" data-testid="for-you-basis">
            From your favorites and plays: {listOf(head.basis)}. A new order every day.
          </p>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-warn">
          {error}
        </p>
      ) : !head ? (
        <p className="text-ink-2">Loading…</p>
      ) : head.basis.length === 0 ? (
        <Card className="space-y-2" data-testid="for-you-empty">
          <p className="flex items-center gap-2 font-medium">
            <Heart size={16} aria-hidden className="text-accent" /> Favorite a few records to get
            picks for you.
          </p>
          <p className="text-sm text-ink-2">
            Picks come from the styles you favorite and play most. Start on the{" "}
            <Link href="/" className="text-accent underline">
              Dig screen
            </Link>
            .
          </p>
        </Card>
      ) : (
        <SequenceList load={load} emptyText="Nothing new in your styles today." />
      )}
    </div>
  );
}
