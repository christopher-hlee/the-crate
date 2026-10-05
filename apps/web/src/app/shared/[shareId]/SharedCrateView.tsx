"use client";

import type { CrateItem } from "@app/api-client";
import { useCallback, useState } from "react";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { SequenceList } from "@/components/SequenceList";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * A shared crate's records and, for a seeded crate, its seeded order. One player per screen:
 * the tabs swap the list, they never add a second player.
 */
export function SharedCrateView({
  shareId,
  items,
  seeded,
}: {
  shareId: string;
  items: CrateItem[];
  seeded: boolean;
}) {
  const [view, setView] = useState<"saved" | "sequence">(
    seeded && items.length === 0 ? "sequence" : "saved",
  );
  const load = useCallback((page: number) => api.sharedSequence(shareId, page), [shareId]);

  return (
    <div className="space-y-4">
      {seeded && (
        <div className="flex gap-2" role="tablist" aria-label="Shared crate view">
          <Button
            role="tab"
            aria-selected={view === "saved"}
            variant={view === "saved" ? "primary" : "outline"}
            size="sm"
            onClick={() => setView("saved")}
          >
            Saved records
          </Button>
          <Button
            role="tab"
            aria-selected={view === "sequence"}
            variant={view === "sequence" ? "primary" : "outline"}
            size="sm"
            onClick={() => setView("sequence")}
          >
            Seeded order
          </Button>
        </div>
      )}
      {seeded && view === "sequence" ? (
        <section className="space-y-2" aria-label="Seeded order">
          <p className="text-sm text-ink-2">
            The same order for everyone who opens this link: dig the sequence the curator set up.
          </p>
          <SequenceList load={load} emptyText="Nothing matches this crate's filters right now." />
        </section>
      ) : (
        <ItemListPlayer items={items} hearts emptyText="This crate is empty." />
      )}
    </div>
  );
}
