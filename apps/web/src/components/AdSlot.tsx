"use client";

import { useViewer } from "@/lib/viewer";

/**
 * Free-tier ad space: below the record panel, never on or over the player (rule 12). Off
 * until FEATURE_ADS is set (the spec's default is no ads until Pro ships), and never for Pro.
 */
export function AdSlot() {
  const { isPro } = useViewer();
  if (process.env.NEXT_PUBLIC_FEATURE_ADS !== "1" || isPro) return null;
  return (
    <aside
      aria-label="Advertisement"
      className="rounded-md border border-dashed border-line p-4 text-center text-xs text-ink-2"
    >
      Advertisement
    </aside>
  );
}
