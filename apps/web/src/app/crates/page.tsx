"use client";

import { ApiError, type Crate } from "@app/api-client";
import { Heart, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

type Limits = { maxCrates: number | null; maxItemsPerCrate: number | null };

export default function CratesPage() {
  const { me, loading } = useViewer();
  const userId = me?.user.id ?? null;
  const [crates, setCrates] = useState<Crate[] | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .crates()
      .then((r) => {
        if (cancelled) return;
        setCrates(r.crates);
        setLimits(r.limits);
      })
      .catch((err) => {
        if (cancelled) return;
        setCrates([]);
        setError(err instanceof ApiError ? err.message : "Couldn't load your crates.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return null;
  if (!me) return <SignInPrompt what="keep crates" />;

  const maxCrates = limits?.maxCrates ?? me.limits.maxCrates;
  // Free accounts have no crates. A lapsed Pro keeps (and plays) the crates it made.
  const noCrates = maxCrates === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Crates</h1>
          {!noCrates && crates !== null && (
            <p className="text-sm text-ink-2" data-testid="crates-count">
              {maxCrates === null
                ? `${crates.length.toLocaleString("en-US")} crates`
                : `${crates.length.toLocaleString("en-US")} of ${maxCrates.toLocaleString("en-US")}`}
              {limits?.maxItemsPerCrate
                ? `, up to ${limits.maxItemsPerCrate.toLocaleString("en-US")} records each.`
                : "."}
            </p>
          )}
        </div>
        {!noCrates && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                const c = await api.createCrate({ name });
                setCrates((list) => [...(list ?? []), c]);
                setName("");
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Couldn't create the crate.");
              }
            }}
          >
            <Input
              placeholder="New crate"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New crate name"
            />
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              Create
            </Button>
          </form>
        )}
      </div>
      {noCrates && (
        <Card className="space-y-2" data-testid="crates-upsell">
          <p className="flex items-center gap-2 font-medium">
            <Lock size={16} aria-hidden /> Crates are a Pro tool. Favorites are free: heart any
            record.
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link
              href="/favorites"
              className="inline-flex items-center gap-1 text-accent underline"
            >
              <Heart size={14} aria-hidden /> Your favorites
            </Link>
            <Link href="/account" className="text-accent underline">
              Go Pro for crates
            </Link>
          </p>
          {crates && crates.length > 0 && (
            <p className="text-sm text-ink-2">
              The crates you made on Pro stay here to play, rename or stop sharing. Adding records
              needs Pro.
            </p>
          )}
        </Card>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      {crates === null ? (
        <p className="text-ink-2">Loading…</p>
      ) : crates.length === 0 ? (
        noCrates ? null : (
          <p className="text-ink-2">
            No crates yet. Save a record from the Dig screen, or create a crate here.
          </p>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crates.map((c) => (
            <li key={c.id}>
              <Link href={`/crates/${c.id}`}>
                <Card className="h-full hover:border-accent">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-ink-2">
                    {c.itemCount} record{c.itemCount === 1 ? "" : "s"}
                    {c.seed !== null && " · seeded"}
                    {c.shareId && " · shared"}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
