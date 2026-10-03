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
};

/** Pro: timestamped notes on a video. Inline, below the player controls. */
export function NotePanel({ open, onClose, recordKey, videoId, getPosition }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [stamp, setStamp] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .notes(videoId)
      .then((r) => setNotes(r.notes))
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
      setNotes((n) => [note, ...n]);
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
          <li key={n.id} className="flex gap-2">
            {n.atSeconds !== null && (
              <span className="tabular-nums text-accent">{formatDuration(n.atSeconds)}</span>
            )}
            <span className="whitespace-pre-wrap">{n.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
