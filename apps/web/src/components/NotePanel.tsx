"use client";

import { ApiError, type Note } from "@app/api-client";
import { formatDuration } from "@app/core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  recordKey: string;
  videoId: string;
  getPosition: () => number;
  /** Jump the player to a note's time. */
  onJump?: (seconds: number) => void;
};

const byTime = (a: Note, b: Note) =>
  (a.atSeconds ?? Number.POSITIVE_INFINITY) - (b.atSeconds ?? Number.POSITIVE_INFINITY) ||
  b.createdAt.localeCompare(a.createdAt);

/** Timestamped notes on a video, for anyone signed in. Inline, below the player controls. */
export function NotePanel({ open, onClose, recordKey, videoId, getPosition, onJump }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [stamp, setStamp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .notes(videoId)
      .then((r) => setNotes([...r.notes].sort(byTime)))
      .catch(() => setNotes([]));
  }, [open, videoId]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    try {
      const note = await api.createNote({
        recordKey,
        videoId,
        body,
        atSeconds: stamp ? Math.floor(getPosition()) : null,
      });
      setNotes((n) => [...n, note].sort(byTime));
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the note.");
    }
  };

  return (
    <div
      className="space-y-2 rounded-md border border-line bg-surface p-3 text-sm"
      data-testid="note-panel"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">Notes</p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) void submit();
        }}
      >
        <textarea
          className="min-h-20 w-full rounded-md border border-line bg-surface p-2"
          placeholder="Break at 2:14, horn stab at the end…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Note"
          maxLength={2000}
        />
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} />{" "}
            Stamp the current time
          </label>
          <Button type="submit" size="sm" variant="primary" disabled={!body.trim()}>
            Add note
          </Button>
        </div>
      </form>
      {error && <p className="text-warn">{error}</p>}
      <ul className="space-y-1">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-2">
            {n.atSeconds !== null &&
              (onJump ? (
                <button
                  type="button"
                  className="tabular-nums text-accent underline"
                  onClick={() => onJump(n.atSeconds ?? 0)}
                  title="Play from here"
                >
                  {formatDuration(n.atSeconds)}
                </button>
              ) : (
                <span className="tabular-nums text-accent">{formatDuration(n.atSeconds)}</span>
              ))}
            {editing?.id === n.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editing.body.trim()) return;
                  try {
                    await api.updateNote(n.id, { body: editing.body });
                    setNotes((all) =>
                      all.map((x) => (x.id === n.id ? { ...x, body: editing.body.trim() } : x)),
                    );
                    setEditing(null);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Couldn't update the note.");
                  }
                }}
              >
                <input
                  className="flex-1 rounded border border-line bg-surface px-2"
                  value={editing.body}
                  maxLength={2000}
                  onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                  aria-label="Edit note"
                />
                <Button type="submit" size="sm">
                  Save
                </Button>
              </form>
            ) : (
              <span className="flex-1 whitespace-pre-wrap">{n.body}</span>
            )}
            {editing?.id !== n.id && (
              <span className="flex gap-2 text-xs text-ink-2">
                <button
                  type="button"
                  className="underline"
                  onClick={() => setEditing({ id: n.id, body: n.body })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={async () => {
                    try {
                      await api.deleteNote(n.id);
                      setNotes((all) => all.filter((x) => x.id !== n.id));
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : "Couldn't delete the note.");
                    }
                  }}
                >
                  Delete
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
