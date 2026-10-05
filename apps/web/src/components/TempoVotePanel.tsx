"use client";

import { ApiError } from "@app/api-client";
import { tapTempo } from "@app/core";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  releaseId: number;
  track: { position: string; title: string } | null;
  /** Tapping is a free tool for anyone; sending a vote needs an account. */
  signedIn: boolean;
};

const KEYS = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [`${n}A`, `${n}B`]);

/** Tap tempo for anyone; signed-in users can vote a tempo and key. Agreeing votes become community data. */
export function TempoVotePanel({ open, onClose, releaseId, track, signedIn }: Props) {
  const [taps, setTaps] = useState<number[]>([]);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (!open) return null;
  const bpm = tapTempo(taps);
  return (
    <div
      className="space-y-3 rounded-md border border-line bg-surface p-3 text-sm"
      data-testid="tempo-panel"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">
          Tempo and key {track ? `· ${track.position}. ${track.title}` : ""}
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setTaps((t) => [...t.slice(-12), performance.now()])}
          data-testid="tap"
        >
          Tap along
        </Button>
        <span className="tabular-nums text-lg" data-testid="tap-bpm">
          {bpm ? `${bpm} BPM` : `${taps.length} / 4 taps`}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setTaps([])}>
          Reset
        </Button>
      </div>
      {!track ? (
        <p className="text-ink-2">
          This video isn&apos;t matched to a track yet, so there&apos;s nothing to vote on.
        </p>
      ) : !signedIn ? (
        <p className="text-ink-2">
          <Link href="/login?next=/" className="text-accent underline">
            Sign in
          </Link>{" "}
          to vote a tempo or key for this track.
        </p>
      ) : (
        <>
          <label className="inline-flex items-center gap-2">
            Key
            <select
              className="rounded border border-line bg-surface px-2 py-1"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              <option value="">Not sure</option>
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Button
              variant="primary"
              size="sm"
              disabled={!bpm && !key}
              onClick={async () => {
                setMessage(null);
                try {
                  await api.tempoVote({
                    releaseId,
                    trackPosition: track.position,
                    ...(bpm ? { bpm } : {}),
                    ...(key ? { camelotKey: key } : {}),
                  });
                  setMessage("Thanks. Votes that agree with others' become the track's tempo.");
                  setTaps([]);
                } catch (err) {
                  setMessage(err instanceof ApiError ? err.message : "Couldn't send the vote.");
                }
              }}
            >
              Send vote
            </Button>
          </div>
        </>
      )}
      {message && <p className="text-ink-2">{message}</p>}
    </div>
  );
}
