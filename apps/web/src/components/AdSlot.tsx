"use client";

import { PLAN_LIMITS, readFlags } from "@app/core";
import { useViewer } from "@/lib/viewer";

/** NEXT_PUBLIC_FEATURE_ADS, read like every other flag ("1", "true", "on" or "yes"). */
const ADS_FLAG = readFlags({ FEATURE_ADS: process.env.NEXT_PUBLIC_FEATURE_ADS }).FEATURE_ADS;

/**
 * Ad space for plans that carry ads (PLAN_LIMITS[plan].ads; signed out counts as Free). Off
 * unless the flag is on, and hidden until the viewer is known so Pro never sees a flash of an
 * ad. It sits in the page flow below the record panel: never on or over the player (rule 12).
 */
export function AdSlot() {
  const { me, loading } = useViewer();
  if (!ADS_FLAG || loading || !PLAN_LIMITS[me?.plan ?? "free"].ads) return null;
  return (
    <aside
      aria-label="Advertisement"
      data-testid="ad-slot"
      className="rounded-md border border-dashed border-line p-4 text-center text-xs text-ink-2"
    >
      Advertisement
    </aside>
  );
}
