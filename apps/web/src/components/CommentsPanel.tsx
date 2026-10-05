"use client";

// Comments on a record. Inline in the page flow (never over the player). Reading is public;
// posting needs a display name. Anyone signed in can report a comment, and comments hide
// themselves after enough reports.

import { ApiError, type Comment } from "@app/api-client";
import { displayNameProblem } from "@app/core";
import { Flag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
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
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());

  useEffect(() => {
    setComments(null);
    api
      .comments(recordKey)
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]));
  }, [recordKey]);

  const post = async () => {
    setError(null);
    try {
      const c = await api.addComment(recordKey, body);
      setComments((all) => [c, ...(all ?? [])]);
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't post that.");
    }
  };

  const saveName = async () => {
    setError(null);
    const problem = displayNameProblem(name);
    if (problem) return setError(problem);
    try {
      await api.setDisplayName(name.trim());
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that name.");
    }
  };

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
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="primary" disabled={!body.trim()}>
              Post
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
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
                    onClick={async () => {
                      await api.deleteComment(c.id).catch(() => undefined);
                      setComments((all) => all?.filter((x) => x.id !== c.id) ?? null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  me && (
                    <button
                      type="button"
                      aria-label="Report comment"
                      disabled={reported.has(c.id)}
                      title={reported.has(c.id) ? "Reported" : "Report"}
                      onClick={async () => {
                        await api.reportComment(c.id).catch(() => undefined);
                        setReported((r) => new Set(r).add(c.id));
                      }}
                    >
                      <Flag size={14} />
                    </button>
                  )
                )}
              </span>
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
        {comments?.length === 0 && <li className="text-sm text-ink-2">No comments yet.</li>}
      </ul>
    </section>
  );
}
