"use client";

import { ApiError, type Crate } from "@app/api-client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

/**
 * Share links and crate-sheet export: Pro tools. Any owner can stop sharing a shared crate,
 * so a lapsed subscriber can always unpublish.
 */
export function CrateProTools({ crate, onChange }: { crate: Crate; onChange: (c: Crate) => void }) {
  const { me } = useViewer();
  const canShare = me?.limits.createShared ?? false;
  const canExport = me?.limits.crateExport ?? false;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shareUrl =
    crate.shareId && typeof window !== "undefined"
      ? `${window.location.origin}/shared/${crate.shareId}`
      : null;

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={() =>
        void run(async () => onChange(await api.unshare(crate.id)), "Couldn't stop sharing.")
      }
    >
      Stop sharing
    </Button>
  );

  return (
    <div className="space-y-2 text-sm">
      {(shareUrl || canShare || canExport) && (
        <div className="flex flex-wrap items-center gap-2">
          {shareUrl ? (
            <>
              <a href={shareUrl} className="truncate text-accent underline">
                {shareUrl}
              </a>
              {stopSharing}
            </>
          ) : canShare ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api.share(crate.id);
                  onChange({ ...crate, shareId: r.shareId });
                }, "Couldn't share the crate.")
              }
            >
              Share link
            </Button>
          ) : null}
          {canExport && (
            <>
              <a
                className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2"
                href={api.exportUrl(crate.id, "csv")}
              >
                Export CSV
              </a>
              <a
                className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2"
                href={api.exportUrl(crate.id, "json")}
              >
                Export JSON
              </a>
            </>
          )}
        </div>
      )}
      {!(canShare && canExport) && (
        <p className="flex items-center gap-1.5 text-ink-2">
          <Lock size={14} aria-hidden /> Share links and CSV or JSON crate sheets are Pro tools.{" "}
          <Link href="/account" className="text-accent underline">
            Go Pro
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
