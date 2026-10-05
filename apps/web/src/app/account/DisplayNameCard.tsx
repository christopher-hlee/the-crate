"use client";

import { ApiError, type MeResponse } from "@app/api-client";
import { displayNameProblem } from "@app/core";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/** The public name shown on comments, and the rank earned by contributing. */
export function DisplayNameCard({ me, onSaved }: { me: MeResponse; onSaved: () => Promise<void> }) {
  const current = me.profile?.displayName ?? "";
  const [name, setName] = useState(current);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const problem = displayNameProblem(name);
  const shownProblem = touched ? problem : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setSaved(false);
    setError(null);
    if (problem) return;
    setBusy(true);
    try {
      await api.setDisplayName(name.trim());
      await onSaved();
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("That name is taken.");
      else setError(err instanceof ApiError ? err.message : "Couldn't save the name. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Display name</h2>
        <p className="text-sm text-ink-2">
          Shown publicly with your comments.
          {current ? "" : " Choose one before you comment."}
        </p>
      </div>
      {current && (
        <p className="text-sm">
          Comments show you as{" "}
          <span className="font-semibold" data-testid="display-name">
            {current}
          </span>
        </p>
      )}
      <form className="flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={onSubmit}>
        <div className="flex-1 space-y-1">
          <Input
            aria-label="Display name"
            autoComplete="nickname"
            maxLength={30}
            value={name}
            aria-invalid={shownProblem ? true : undefined}
            aria-describedby={shownProblem ? `${ids}-problem` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
              setSaved(false);
              setError(null);
            }}
          />
          {shownProblem && (
            <p id={`${ids}-problem`} className="text-sm text-warn">
              {shownProblem}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || name.trim() === current || Boolean(shownProblem)}
        >
          Save name
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-good">
          Saved.
        </p>
      )}
      <p className="border-t border-line pt-3 text-sm">
        Rank:{" "}
        <span className="font-semibold" data-testid="rank">
          {me.rank.title}
        </span>{" "}
        <span className="text-ink-2">
          · level {me.rank.level} · {me.rank.points.toLocaleString("en-US")} points from favorites,
          comments and tempo and key votes
        </span>
      </p>
    </Card>
  );
}
