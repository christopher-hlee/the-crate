"use client";

import { ApiError, type CrateDetail, type CrateItem } from "@app/api-client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CrateProTools } from "@/components/CrateProTools";
import { ItemListPlayer } from "@/components/ItemListPlayer";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

export default function CratePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, loading } = useViewer();
  const [data, setData] = useState<CrateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!me) return;
    api
      .crate(id)
      .then((d) => {
        setData(d);
        setName(d.crate.name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the crate."));
  }, [me, id]);

  if (loading) return null;
  if (!me) return <SignInPrompt what="see your crates" />;
  if (error) return <p className="text-warn">{error}</p>;
  if (!data) return <p className="text-ink-2">Loading…</p>;

  const move = async (index: number, delta: number) => {
    const items = [...data.items];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target] as CrateItem, items[index] as CrateItem];
    setData(
      await api.reorderItems(
        id,
        items.map((i) => ({ recordKey: i.recordKey, videoId: i.videoId })),
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const c = await api.updateCrate(id, { name });
            setData({ ...data, crate: c });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm text-lg font-semibold"
            aria-label="Crate name"
          />
          {name !== data.crate.name && (
            <Button type="submit" variant="primary">
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
              onClick={async () => {
                await api.deleteCrate(id);
                router.push("/crates");
              }}
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
      <CrateProTools crate={data.crate} onChange={(crate) => setData({ ...data, crate })} />
      <ItemListPlayer
        items={data.items}
        emptyText="This crate is empty. Press Save on the Dig screen to add records."
        actions={(item, i) => (
          <span className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move up"
              onClick={() => void move(i, -1)}
              disabled={i === 0}
            >
              <ArrowUp size={16} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move down"
              onClick={() => void move(i, 1)}
              disabled={i === data.items.length - 1}
            >
              <ArrowDown size={16} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove from crate"
              onClick={async () =>
                setData(
                  await api.removeItem(id, { recordKey: item.recordKey, videoId: item.videoId }),
                )
              }
            >
              <Trash2 size={16} />
            </Button>
          </span>
        )}
      />
    </div>
  );
}
