"use client";

import { ApiError } from "@app/api-client";
import { NotebookPen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export const ITEM_NOTE_MAX = 1000;

type Props = {
  note: string | null;
  /** Saves the note; null clears it. */
  save: (note: string | null) => Promise<void>;
  /** Accessible label, e.g. "Note on Artist – Title". */
  label?: string;
  className?: string;
};

/**
 * A one-line note on a list row, saved on blur or Enter (Escape undoes the edit). It renders
 * inline in the row, never as a popover, so nothing is ever drawn over the player.
 */
export function ItemNote({ note, save, label = "Note", className }: Props) {
  const [value, setValue] = useState(note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(note ?? "");
  const inFlight = useRef<string | null>(null);

  // A reloaded list brings the stored note.
  useEffect(() => {
    saved.current = note ?? "";
    setValue(note ?? "");
  }, [note]);

  const commit = async () => {
    const next = value.trim().slice(0, ITEM_NOTE_MAX);
    if (next === saved.current || next === inFlight.current) return;
    inFlight.current = next;
    setState("saving");
    setError(null);
    try {
      await save(next === "" ? null : next);
      saved.current = next;
      setValue(next);
      setState("saved");
    } catch (err) {
      setState("error");
      setError(err instanceof ApiError ? err.message : "Couldn't save the note.");
    } finally {
      inFlight.current = null;
    }
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
      <NotebookPen size={14} aria-hidden className="shrink-0 text-ink-2" />
      <input
        type="text"
        value={value}
        maxLength={ITEM_NOTE_MAX}
        aria-label={label}
        placeholder="Add a note"
        data-testid="item-note"
        className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-ink-2/70 hover:border-line focus:border-line focus:bg-surface"
        onChange={(e) => {
          setValue(e.target.value);
          if (state !== "saving") setState("idle");
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            setValue(saved.current);
            setState("idle");
          }
        }}
      />
      <span aria-live="polite" className="shrink-0 text-xs text-ink-2">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
      </span>
      {state === "error" && error && <span className="shrink-0 text-xs text-warn">{error}</span>}
    </div>
  );
}
