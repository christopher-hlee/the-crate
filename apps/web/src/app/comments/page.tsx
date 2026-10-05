"use client";

import type { MyComment } from "@app/api-client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

export default function MyCommentsPage() {
  const { me, loading } = useViewer();
  const [comments, setComments] = useState<MyComment[] | null>(null);

  useEffect(() => {
    document.title = "Your comments";
    if (!me) return;
    api
      .myComments()
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]));
  }, [me]);

  if (loading) return null;
  if (!me) return <SignInPrompt what="see your comments" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your comments</h1>
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
                onClick={async () => {
                  await api.deleteComment(c.id).catch(() => undefined);
                  setComments((all) => all?.filter((x) => x.id !== c.id) ?? null);
                }}
              >
                <Trash2 size={14} />
              </button>
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
        {comments?.length === 0 && (
          <li className="text-sm text-ink-2">
            No comments yet. Leave one on any record while you dig.
          </li>
        )}
      </ul>
    </div>
  );
}
