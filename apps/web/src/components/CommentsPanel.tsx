"use client";

// Comments on a record. Inline in the page flow (never over the player). Reading is public;
// posting and reporting need a display name. Anyone signed in can block a commenter, whose
// comments then stop showing to them. Comments hide themselves after enough reports.

import type { Comment } from "@app/api-client";
import { displayNameProblem } from "@app/core";
import { Ban, Flag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { failureMessage } from "@/lib/comment-errors";
import { useViewer } from "@/lib/viewer";

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function CommentsPanel({ recordKey }: { recordKey: string }) {
  const { me, refresh } = useViewer();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [confirmBlock, setConfirmBlock] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger
  useEffect(() => {
    let live = true;
    setComments(null);
    setLoadFailed(false);
    api
      .comments(recordKey)
      .then((r) => live && setComments(r.comments))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [recordKey, attempt]);

  const say = (message: { error?: string; notice?: string }) => {
    setError(message.error ?? null);
    setNotice(message.notice ?? null);
  };

  const post = async () => {
    say({});
    try {
      const c = await api.addComment(recordKey, body);
      setComments((all) => [c, ...(all ?? [])]);
      setBody("");
    } catch (err) {
      // The server's reason when it has one: the link filter, a blocked term, a rate limit.
      say({ error: failureMessage(err, "Couldn't post that. Try again.") });
    }
  };

  const saveName = async () => {
    say({});
    const problem = displayNameProblem(name);
    if (problem) return say({ error: problem });
    try {
      await api.setDisplayName(name.trim());
      await refresh();
    } catch (err) {
      say({ error: failureMessage(err, "Couldn't save that name.") });
    }
  };

  /** Runs one action on a comment; the list changes only once the server has said yes. */
  const act = async (id: string, run: () => Promise<void>, fallback: string) => {
    say({});
    setPending(id);
    try {
      await run();
    } catch (err) {
      say({ error: failureMessage(err, fallback) });
    } finally {
      setPending(null);
    }
  };

  const remove = (c: Comment) =>
    act(
      c.id,
      async () => {
        await api.deleteComment(c.id);
        setComments((all) => all?.filter((x) => x.id !== c.id) ?? null);
      },
      "Couldn't delete the comment. Try again.",
    );

  const report = (c: Comment) =>
    act(
      c.id,
      async () => {
        await api.reportComment(c.id);
        setReported((r) => new Set(r).add(c.id));
        say({ notice: "Reported. Thanks for flagging it." });
      },
      "Couldn't report the comment. Try again.",
    );

  const block = (c: Comment) =>
    act(
      c.id,
      async () => {
        const blocked = await api.blockCommenter(c.id);
        setConfirmBlock(null);
        // Display names are unique, so this drops exactly that author's comments.
        setComments(
          (all) => all?.filter((x) => x.author.displayName !== c.author.displayName) ?? null,
        );
        say({
          notice: `Blocked ${blocked.displayName}. Unblock them any time from your account page.`,
        });
      },
      "Couldn't block that commenter. Try again.",
    );

  return (
    <section className="space-y-3" aria-label="Comments" data-testid="comments">
      <h3 className="text-sm font-semibold">
        Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}
      </h3>
      {!me ? (
        <p className="text-sm text-ink-2">
          <Link
            href={`/login?next=${encodeURIComponent(`/records/${recordKey}`)}`}
            className="text-accent underline"
          >
            Sign in
          </Link>{" "}
          to comment.
        </p>
      ) : !me.profile ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
        >
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-xs text-ink-2">Choose a display name to comment</span>
            <Input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              aria-label="Display name"
            />
          </label>
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Save name
          </Button>
        </form>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) void post();
          }}
        >
          <textarea
            className="min-h-16 w-full rounded-md border border-line bg-surface p-2 text-sm"
            placeholder={`Comment as ${me.profile.displayName}: a sample spotted, a pressing tip…`}
            value={body}
            maxLength={1000}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Comment"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-2">
              No links.{" "}
              <Link href="/legal/terms#what-you-post" className="underline">
                What you can post
              </Link>
            </p>
            <Button type="submit" size="sm" variant="primary" disabled={!body.trim()}>
              Post
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink-2">
          {notice}
        </p>
      )}
      <ul className="space-y-3">
        {comments?.map((c) => (
          <li key={c.id} className="space-y-1 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span className="font-medium text-ink">{c.author.displayName}</span>
              <Badge title={`Rank ${c.author.rank.level}`}>{c.author.rank.title}</Badge>
              {c.author.pro && <Badge>Pro</Badge>}
              <span>{ago(c.createdAt)}</span>
              <span className="ml-auto flex gap-2">
                {c.mine ? (
                  <button
                    type="button"
                    aria-label="Delete comment"
                    disabled={pending === c.id}
                    onClick={() => void remove(c)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  me && (
                    <>
                      <button
                        type="button"
                        aria-label="Report comment"
                        disabled={reported.has(c.id) || pending === c.id}
                        title={reported.has(c.id) ? "Reported" : "Report"}
                        onClick={() => void report(c)}
                      >
                        <Flag size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Block commenter"
                        title={`Block ${c.author.displayName}`}
                        aria-expanded={confirmBlock === c.id}
                        disabled={pending === c.id}
                        onClick={() => {
                          say({});
                          setConfirmBlock(confirmBlock === c.id ? null : c.id);
                        }}
                      >
                        <Ban size={14} />
                      </button>
                    </>
                  )
                )}
              </span>
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
            {confirmBlock === c.id && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2 text-xs"
                data-testid="block-confirm"
              >
                <span className="flex-1 text-ink-2">
                  Block {c.author.displayName}? You won&apos;t see their comments. They aren&apos;t
                  told, and you can unblock them from your account page.
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending === c.id}
                  onClick={() => void block(c)}
                >
                  Block
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmBlock(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </li>
        ))}
        {comments === null && !loadFailed && (
          <li className="text-sm text-ink-2">Loading comments…</li>
        )}
        {loadFailed && (
          <li className="flex items-center gap-2 text-sm text-ink-2">
            Couldn&apos;t load comments.
            <Button size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </li>
        )}
        {comments?.length === 0 && <li className="text-sm text-ink-2">No comments yet.</li>}
      </ul>
    </section>
  );
}
