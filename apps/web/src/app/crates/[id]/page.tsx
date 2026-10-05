"use client";

import { ApiError, type CrateDetail, type CrateItem } from "@app/api-client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrateArchiveSection } from "@/components/CrateArchiveSection";
import { CrateProTools } from "@/components/CrateProTools";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { ItemNote } from "@/components/ItemNote";
import { SequenceList } from "@/components/SequenceList";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YouTubePlaylistLinks } from "@/components/YouTubePlaylistLinks";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

type Ref = { recordKey: string; videoId: string };
const refOf = (i: Ref): Ref => ({ recordKey: i.recordKey, videoId: i.videoId });
const same = (a: Ref, b: Ref) => a.recordKey === b.recordKey && a.videoId === b.videoId;
const nameOf = (i: CrateItem) =>
  i.record ? `${i.record.artist} – ${i.record.title}` : i.recordKey;

export default function CratePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, loading } = useViewer();
  const userId = me?.user.id ?? null;
  const [data, setData] = useState<CrateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<"saved" | "sequence">("saved");
  const loadSequence = useCallback((page: number) => api.sequence(id, page), [id]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .crate(id)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setName(d.crate.name);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Couldn't load the crate.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, id]);

  const videoIds = useMemo(
    () => (data?.items ?? []).filter((i) => i.available).map((i) => i.videoId),
    [data],
  );

  if (loading) return null;
  if (!me) return <SignInPrompt what="see your crates" />;
  if (error) return <p className="text-warn">{error}</p>;
  if (!data) return <p className="text-ink-2">Loading…</p>;

  /** Runs one crate action and shows what went wrong, if anything. */
  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: number) =>
    run(async () => {
      const items = [...data.items];
      const target = index + delta;
      if (target < 0 || target >= items.length) return;
      [items[index], items[target]] = [items[target] as CrateItem, items[index] as CrateItem];
      setData(await api.reorderItems(id, items.map(refOf)));
    }, "Couldn't move that record.");

  const canAdd = me.limits.maxItemsPerCrate !== 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const c = await api.updateCrate(id, { name });
              setData((d) => (d ? { ...d, crate: c } : d));
              setName(c.name);
            }, "Couldn't rename the crate.");
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm text-lg font-semibold"
            aria-label="Crate name"
          />
          {name !== data.crate.name && (
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              Rename
            </Button>
          )}
        </form>
        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            Delete this crate?
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.deleteCrate(id);
                  router.push("/crates");
                }, "Couldn't delete the crate.")
              }
            >
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Delete crate
          </Button>
        )}
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-warn">
          {actionError}
        </p>
      )}
      {!canAdd && (
        <p className="text-sm text-ink-2">
          This crate stays playable on Free. Adding records to crates is a Pro tool; favorites are
          free.
        </p>
      )}
      <CrateProTools
        crate={data.crate}
        onChange={(crate) => setData((d) => (d ? { ...d, crate } : d))}
      />
      <CrateArchiveSection crateId={id} crateName={data.crate.name} />
      {data.crate.seed !== null && (
        // One player per screen: the seeded order and the saved records are tabs, never both.
        <div className="flex gap-2" role="tablist" aria-label="Crate view">
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
      {data.crate.seed !== null && view === "sequence" ? (
        <section className="space-y-2" aria-label="Seeded order">
          <p className="text-sm text-ink-2">
            The same order every time for these filters and seed: share it and others dig the same
            sequence.
          </p>
          <SequenceList
            load={loadSequence}
            emptyText="Nothing matches this crate's filters right now."
          />
        </section>
      ) : (
        <section className="space-y-4" aria-label="Saved records">
          <YouTubePlaylistLinks videoIds={videoIds} />
          <ItemListPlayer
            items={data.items}
            hearts
            emptyText="This crate is empty. Press Save on the Dig screen to add records."
            details={(item) => (
              <ItemNote
                note={item.note}
                label={`Note on ${nameOf(item)}`}
                save={async (note) => {
                  await api.setCrateItemNote(id, refOf(item), note);
                  setData((d) =>
                    d
                      ? { ...d, items: d.items.map((i) => (same(i, item) ? { ...i, note } : i)) }
                      : d,
                  );
                }}
              />
            )}
            actions={(item, i) => (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move up"
                  onClick={() => void move(i, -1)}
                  disabled={busy || i === 0}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move down"
                  onClick={() => void move(i, 1)}
                  disabled={busy || i === data.items.length - 1}
                >
                  <ArrowDown size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove from crate"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () => setData(await api.removeItem(id, refOf(item))),
                      "Couldn't remove that record.",
                    )
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </>
            )}
          />
        </section>
      )}
    </div>
  );
}
