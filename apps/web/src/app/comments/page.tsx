"use client";

import type { MyComment } from "@app/api-client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { failureMessage } from "@/lib/comment-errors";
import { useViewer } from "@/lib/viewer";

export default function MyCommentsPage() {
  const { me, loading } = useViewer();
  const [comments, setComments] = useState<MyComment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger
  useEffect(() => {
    document.title = "Your comments";
    if (!me) return;
    let live = true;
    setLoadFailed(false);
    api
      .myComments()
      .then((r) => live && setComments(r.comments))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [me, attempt]);

  // Removed from the list only once the server has deleted it.
  const remove = async (id: string) => {
    setError(null);
    setPending(id);
    try {
      await api.deleteComment(id);
      setComments((all) => all?.filter((x) => x.id !== id) ?? null);
    } catch (err) {
      setError(failureMessage(err, "Couldn't delete the comment. Try again."));
    } finally {
      setPending(null);
    }
  };

  if (loading) return null;
  if (!me) return <SignInPrompt what="see your comments" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your comments</h1>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <ul className="space-y-3" data-testid="my-comments">
        {comments?.map((c) => (
          <li key={c.id} className="space-y-1 rounded-md border border-line p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <Link href={`/records/${encodeURIComponent(c.recordKey)}`} className="underline">
                {c.record ? `${c.record.artist} – ${c.record.title}` : "A record no longer listed"}
              </Link>
              <span>{new Date(c.createdAt).toLocaleDateString()}</span>
              {c.hidden && <span className="text-warn">Hidden after reports</span>}
              <button
                type="button"
                className="ml-auto"
                aria-label="Delete comment"
                disabled={pending === c.id}
                onClick={() => void remove(c.id)}
              >
                <Trash2 size={14} />
              </button>
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
        {loadFailed && (
          <li className="flex items-center gap-2 text-sm text-ink-2">
            Couldn&apos;t load your comments.
            <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </li>
        )}
        {!loadFailed && comments?.length === 0 && (
          <li className="text-sm text-ink-2">
            No comments yet. Leave one on any record while you dig.
          </li>
        )}
      </ul>
    </div>
  );
}
