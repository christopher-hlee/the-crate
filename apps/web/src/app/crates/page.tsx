"use client";

import { ApiError, type Crate } from "@app/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

export default function CratesPage() {
  const { me, loading } = useViewer();
  const [crates, setCrates] = useState<Crate[] | null>(null);
  const [limits, setLimits] = useState<{
    maxCrates: number | null;
    maxItemsPerCrate: number | null;
  } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api
      .crates()
      .then((r) => {
        setCrates(r.crates);
        setLimits(r.limits);
      })
      .catch(() => setCrates([]));
  }, [me]);

  if (loading) return null;
  if (!me) return <SignInPrompt what="keep crates" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Crates</h1>
          {limits?.maxCrates !== null && limits && (
            <p className="text-sm text-ink-2">
              Free accounts keep {limits.maxCrates} crates of up to {limits.maxItemsPerCrate}{" "}
              records.{" "}
              <Link className="text-accent underline" href="/account">
                Go Pro
              </Link>{" "}
              for unlimited crates.
            </p>
          )}
        </div>
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
      </div>
      {error && <p className="text-sm text-warn">{error}</p>}
      {crates === null ? (
        <p className="text-ink-2">Loading…</p>
      ) : crates.length === 0 ? (
        <p className="text-ink-2">
          No crates yet. Save a record from the Dig screen, or create a crate here.
        </p>
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
