"use client";

import { ApiError, type Crate } from "@app/api-client";
import { type Filters, newSeed } from "@app/core";
import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

type Props = {
  item: { recordKey: string; videoId: string };
  /** Pro: offer to seed a new crate with the current filters. */
  seedFilters?: Filters | null;
  open: boolean;
  onClose: () => void;
  onSaved: (crateName: string) => void;
};

/**
 * Inline crate picker. It expands in the page flow below the controls, never as a floating
 * menu, so nothing can land on top of the player.
 */
export function SaveToCrate({ item, seedFilters, open, onClose, onSaved }: Props) {
  const { me } = useViewer();
  const [crates, setCrates] = useState<Crate[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!open || !me) return;
    api
      .crates()
      .then((r) => setCrates(r.crates))
      .catch(() => setCrates([]));
  }, [open, me]);

  if (!open) return null;
  if (!me) {
    return (
      <div
        className="rounded-md border border-line bg-surface p-3 text-sm"
        data-testid="save-panel"
      >
        <Link href="/login" className="text-accent underline">
          Sign in
        </Link>{" "}
        to save records to crates.
      </div>
    );
  }

  const save = async (crateId: string, crateName: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.addItem(crateId, item);
      onSaved(crateName);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const crate = await api.createCrate(
        seeded && seedFilters
          ? { name: name.trim(), filters: seedFilters, seed: newSeed() }
          : { name: name.trim() },
      );
      setName("");
      await save(crate.id, crate.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the crate.");
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-2 rounded-md border border-line bg-surface p-3 text-sm"
      data-testid="save-panel"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">Save to a crate</p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {crates === null ? (
        <p className="text-ink-2">Loading crates…</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {crates.map((c) => (
            <li key={c.id}>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => save(c.id, c.name)}
              >
                <Check size={14} aria-hidden /> {c.name}{" "}
                <span className="text-ink-2">{c.itemCount}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          placeholder="New crate name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New crate name"
        />
        <Button type="submit" size="md" variant="primary" disabled={busy || !name.trim()}>
          <Plus size={14} aria-hidden /> Create
        </Button>
      </form>
      {seedFilters && (
        <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={seeded} onChange={(e) => setSeeded(e.target.checked)} />
          Seed the new crate with these filters, for a shareable order anyone can replay
        </label>
      )}
      {error && <p className="text-warn">{error}</p>}
    </div>
  );
}
