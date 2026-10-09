// "More from this release / channel / label / artist" (Pro filters): each scope replaces the
// current filters and shuffles. Pure so it can be tested off-device.

import type { RecordDetail, ShufflePick } from "@app/api-client";
import { CHANNEL_ID_PATTERN, type Filters } from "@app/core";

export type Scope = { id: string; label: string; hint: string | null; filters: Filters };

const SCOPE_KEYS = ["recordKeys", "channelIds", "labelIds", "artistIds"] as const;
const MAX_PER_KIND = 2;

// Discogs placeholders that would scope to half the catalog.
const PLACEHOLDER = /^(various|unknown artist|not on label)\b/i;

function named(list: readonly { id: number | null; name: string }[] | undefined) {
  const seen = new Set<number>();
  const out: { id: number; name: string }[] = [];
  for (const x of list ?? []) {
    if (x.id === null || seen.has(x.id) || PLACEHOLDER.test(x.name)) continue;
    seen.add(x.id);
    out.push({ id: x.id, name: x.name });
  }
  return out.slice(0, MAX_PER_KIND);
}

/** `detail` when it belongs to `pick`'s record, else null (a late answer for an earlier pick). */
export function detailFor(pick: ShufflePick, detail: RecordDetail | null): RecordDetail | null {
  return detail && detail.recordKey === pick.recordKey ? detail : null;
}

export function moreFromScopes(pick: ShufflePick, anyDetail: RecordDetail | null): Scope[] {
  const detail = detailFor(pick, anyDetail);
  const out: Scope[] = [
    {
      id: "release",
      label: "More from this release",
      hint: null,
      filters: { recordKeys: [pick.recordKey] },
    },
  ];
  if (pick.channel && CHANNEL_ID_PATTERN.test(pick.channel.id))
    out.push({
      id: `channel:${pick.channel.id}`,
      label: "More from this channel",
      hint: pick.channel.title,
      filters: { channelIds: [pick.channel.id] },
    });
  for (const l of named(detail?.labels))
    out.push({
      id: `label:${l.id}`,
      label: `More on ${l.name}`,
      hint: null,
      filters: { labelIds: [l.id] },
    });
  for (const a of named(detail?.artists))
    out.push({
      id: `artist:${a.id}`,
      label: `More by ${a.name}`,
      hint: null,
      filters: { artistIds: [a.id] },
    });
  return out;
}

/** What the dig is scoped to, for the bar that offers a way back out; null when unscoped. */
export function scopeLabel(filters: Filters): string | null {
  if (filters.recordKeys?.length) return "More from this release";
  if (filters.channelIds?.length) return "More from this channel";
  if (filters.labelIds?.length) return "More on this label";
  if (filters.artistIds?.length) return "More by this artist";
  return null;
}

export function withoutScopes(filters: Filters): Filters {
  const out: Filters = { ...filters };
  for (const k of SCOPE_KEYS) delete out[k];
  return out;
}
