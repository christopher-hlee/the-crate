"use client";

import { ApiError, type Crate } from "@app/api-client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/viewer";

/** Share links and crate-sheet export: Pro tools. Free users see them locked. */
export function CrateProTools({ crate, onChange }: { crate: Crate; onChange: (c: Crate) => void }) {
  const { isPro } = useViewer();
  const [error, setError] = useState<string | null>(null);
  const shareUrl =
    crate.shareId && typeof window !== "undefined"
      ? `${window.location.origin}/shared/${crate.shareId}`
      : null;

  if (!isPro) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-ink-2">
        <Lock size={14} aria-hidden /> Share links and CSV or JSON crate sheets are Pro tools.{" "}
        <Link href="/account" className="text-accent underline">
          Go Pro
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {shareUrl ? (
        <>
          <a href={shareUrl} className="truncate text-accent underline">
            {shareUrl}
          </a>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => onChange(await api.unshare(crate.id))}
          >
            Stop sharing
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              const r = await api.share(crate.id);
              onChange({ ...crate, shareId: r.shareId });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't share the crate.");
            }
          }}
        >
          Share link
        </Button>
      )}
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
      {error && <span className="text-warn">{error}</span>}
    </div>
  );
}
