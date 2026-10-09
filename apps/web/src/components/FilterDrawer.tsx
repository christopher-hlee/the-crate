"use client";

import {
  ApiError,
  type CountResponse,
  type SavedFilter,
  type StylesResponse,
} from "@app/api-client";
import { type Filters, isEmptyFilter, normalizeFilters, proFiltersUsed } from "@app/core";
import { Lock, X } from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  census: StylesResponse | null;
  isPro: boolean;
  signedIn: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
};

/** What Pro adds to the filters; one place for the copy. */
export const PRO_FILTERS_BLURB =
  'Keywords, topic channels, deep cuts, format notes and "more from" scopes are Pro tools.';

const fmt = (n: number) => n.toLocaleString("en-US");

function toggle(list: readonly string[] | undefined, value: string): string[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Histogram({
  counts,
  from,
  to,
}: {
  counts: Record<string, number>;
  from?: number;
  to?: number;
}) {
  const years = Object.keys(counts)
    .map(Number)
    .filter((y) => y >= 1900)
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  const first = years[0] as number;
  const last = years[years.length - 1] as number;
  const span = Math.max(1, last - first + 1);
  const max = Math.max(...years.map((y) => counts[String(y)] ?? 0), 1);
  return (
    <svg viewBox={`0 0 ${span} 40`} preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
      {years.map((y) => {
        const h = ((counts[String(y)] ?? 0) / max) * 40;
        const inRange = (from === undefined || y >= from) && (to === undefined || y <= to);
        return (
          <rect
            key={y}
            x={y - first}
            y={40 - h}
            width={0.85}
            height={h}
            className={inRange ? "fill-accent" : "fill-line"}
          />
        );
      })}
    </svg>
  );
}

export function FilterDrawer({ filters, onChange, census, isPro, signedIn, searchRef }: Props) {
  const [query, setQuery] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [count, setCount] = useState<CountResponse | null>(null);
  const [countFailed, setCountFailed] = useState(false);
  const set = (patch: Partial<Filters>) => onChange(normalizeFilters({ ...filters, ...patch }));

  // Live match count for the combined filters, debounced.
  const key = JSON.stringify(normalizeFilters(filters));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the normalized filters
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .count(filters)
        .then((c) => {
          if (cancelled) return;
          setCount(c);
          setCountFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          setCount(null);
          setCountFailed(true);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key]);

  const styleMatches = useMemo(() => {
    const styles = census?.styles ?? [];
    const q = query.trim().toLowerCase();
    return (q ? styles.filter((s) => s.name.toLowerCase().includes(q)) : styles).slice(
      0,
      q ? 30 : 16,
    );
  }, [census, query]);

  const selectedStyles = filters.styles ?? [];
  const often = useMemo(() => {
    if (!census || selectedStyles.length === 0) return [];
    const picked = new Set(selectedStyles);
    const out = new Set<string>();
    for (const s of census.styles)
      if (picked.has(s.name)) for (const o of s.often) if (!picked.has(o)) out.add(o);
    return [...out].slice(0, 8);
  }, [census, selectedStyles]);

  const yearCounts = useMemo(() => {
    if (!census) return {};
    if (selectedStyles.length === 0) return census.years;
    const sum: Record<string, number> = {};
    for (const s of census.styles) {
      if (!selectedStyles.includes(s.name)) continue;
      for (const [y, n] of Object.entries(s.byYear)) sum[y] = (sum[y] ?? 0) + n;
    }
    return sum;
  }, [census, selectedStyles]);

  const yearBounds = useMemo(() => {
    const ys = Object.keys(census?.years ?? {})
      .map(Number)
      .filter((y) => y >= 1900);
    return {
      min: ys.length ? Math.min(...ys) : 1950,
      max: ys.length ? Math.max(...ys) : new Date().getFullYear(),
    };
  }, [census]);

  const countries = useMemo(() => {
    const all = census?.countries ?? [];
    const q = countryQuery.trim().toLowerCase();
    return (q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all).slice(0, 24);
  }, [census, countryQuery]);

  const recordCount = (name: string) => census?.styles.find((s) => s.name === name)?.records;

  return (
    <div className="space-y-5 text-sm" data-testid="filter-drawer">
      <div className="flex items-center justify-between">
        <p className="text-ink-2">
          {count ? (
            <>
              <span className="font-semibold text-ink">{count.display}</span> matches
            </>
          ) : countFailed ? (
            "Couldn't count matches"
          ) : (
            "Counting…"
          )}
        </p>
        <Button size="sm" variant="ghost" onClick={() => onChange({})}>
          Reset
        </Button>
      </div>

      <Section title="Styles">
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search styles  ( / )"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search styles"
        />
        {selectedStyles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedStyles.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ styles: toggle(selectedStyles, s) })}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink"
              >
                {s}
                <X size={12} aria-label={`Remove ${s}`} />
              </button>
            ))}
          </div>
        )}
        <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          {styleMatches.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => set({ styles: toggle(selectedStyles, s.name) })}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-surface-2",
                  selectedStyles.includes(s.name) && "text-accent",
                )}
              >
                <span>
                  {s.name}
                  {s.genre && <span className="ml-1.5 text-xs text-ink-2">{s.genre}</span>}
                </span>
                <span className="tabular-nums text-xs text-ink-2">{fmt(s.records)}</span>
              </button>
            </li>
          ))}
          {census && styleMatches.length === 0 && (
            <li className="px-2 py-1 text-ink-2">No styles match.</li>
          )}
        </ul>
        {often.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-ink-2">Often tagged with</p>
            <div className="flex flex-wrap gap-1.5">
              {often.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set({ styles: [...selectedStyles, s] })}
                >
                  <Badge className="hover:border-accent">
                    + {s}
                    {recordCount(s) !== undefined && (
                      <span className="tabular-nums">{fmt(recordCount(s) ?? 0)}</span>
                    )}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Genres">
        <div className="flex flex-wrap gap-1.5">
          {(census?.genres ?? []).map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => set({ genres: toggle(filters.genres, g.name) })}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                filters.genres?.includes(g.name)
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line hover:bg-surface-2",
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Years"
        aside={
          <span className="tabular-nums text-xs text-ink-2">
            {filters.yearFrom ?? yearBounds.min}–{filters.yearTo ?? yearBounds.max}
          </span>
        }
      >
        <Histogram counts={yearCounts} from={filters.yearFrom} to={filters.yearTo} />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-ink-2">From</span>
            <input
              type="range"
              className="w-full accent-[var(--accent)]"
              min={yearBounds.min}
              max={yearBounds.max}
              value={filters.yearFrom ?? yearBounds.min}
              onChange={(e) => {
                const v = Number(e.target.value);
                set({ yearFrom: v <= yearBounds.min ? undefined : v });
              }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-2">To</span>
            <input
              type="range"
              className="w-full accent-[var(--accent)]"
              min={yearBounds.min}
              max={yearBounds.max}
              value={filters.yearTo ?? yearBounds.max}
              onChange={(e) => {
                const v = Number(e.target.value);
                set({ yearTo: v >= yearBounds.max ? undefined : v });
              }}
            />
          </label>
        </div>
      </Section>

      <Section title="Countries">
        <Input
          type="search"
          placeholder="Search countries"
          value={countryQuery}
          onChange={(e) => setCountryQuery(e.target.value)}
          aria-label="Search countries"
        />
        <div className="flex flex-wrap gap-1.5">
          {countries.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => set({ countries: toggle(filters.countries, c.name) })}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                filters.countries?.includes(c.name)
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line hover:bg-surface-2",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Formats">
        <div className="flex flex-wrap gap-3">
          {(census?.formats ?? []).slice(0, 10).map((f) => (
            <label key={f.name} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={filters.formats?.includes(f.name) ?? false}
                onChange={() => set({ formats: toggle(filters.formats, f.name) })}
              />
              {f.name}
            </label>
          ))}
        </div>
      </Section>

      <TempoKeyViews filters={filters} set={set} coverage={count?.tempoCoverage ?? null} />

      <ScopeChips filters={filters} set={set} />

      <ProFilters filters={filters} set={set} isPro={isPro} />

      {signedIn && <SavedFilters filters={filters} onApply={onChange} isPro={isPro} />}
    </div>
  );
}

function TempoKeyViews({
  filters,
  set,
  coverage,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  coverage: number | null;
}) {
  return (
    <Section title="Tempo, key and views">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-ink-2">BPM from</span>
          <Input
            type="number"
            min={20}
            max={400}
            value={filters.bpmFrom ?? ""}
            onChange={(e) => set({ bpmFrom: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-2">BPM to</span>
          <Input
            type="number"
            min={20}
            max={400}
            value={filters.bpmTo ?? ""}
            onChange={(e) => set({ bpmTo: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
      </div>
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          className="accent-[var(--accent)]"
          checked={filters.halfDouble ?? false}
          onChange={(e) => set({ halfDouble: e.target.checked || undefined })}
        />
        Include half and double time
      </label>
      {coverage !== null && (
        <p className="text-xs text-ink-2" data-testid="tempo-coverage">
          Tempo known for {Math.round(coverage * 100)}% of these matches.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-ink-2">Key (Camelot)</span>
          <select
            className="h-10 w-full rounded-md border border-line bg-surface px-2"
            value={filters.key ?? ""}
            onChange={(e) => set({ key: (e.target.value || undefined) as Filters["key"] })}
          >
            <option value="">Any</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) =>
              ["A", "B"].map((l) => (
                <option key={`${n}${l}`} value={`${n}${l}`}>
                  {n}
                  {l}
                </option>
              )),
            )}
          </select>
        </label>
        <label className="inline-flex items-end gap-1.5 pb-2">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={filters.compatibleKeys ?? false}
            onChange={(e) => set({ compatibleKeys: e.target.checked || undefined })}
          />
          Compatible keys
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-ink-2">Max YouTube views</span>
        <Input
          type="number"
          min={0}
          value={filters.maxViews ?? ""}
          onChange={(e) => set({ maxViews: e.target.value ? Number(e.target.value) : undefined })}
        />
      </label>
    </Section>
  );
}

/** Active "more from" scopes. Removable on any plan, so a Free user is never stuck in one. */
function ScopeChips({ filters, set }: { filters: Filters; set: (p: Partial<Filters>) => void }) {
  const chips: { label: string; clear: Partial<Filters> }[] = [];
  if (filters.recordKeys) chips.push({ label: "This release", clear: { recordKeys: undefined } });
  if (filters.channelIds) chips.push({ label: "This channel", clear: { channelIds: undefined } });
  if (filters.labelIds) chips.push({ label: "This label", clear: { labelIds: undefined } });
  if (filters.artistIds) chips.push({ label: "This artist", clear: { artistIds: undefined } });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs" data-testid="scope-chips">
      <span className="self-center text-ink-2">More from:</span>
      {chips.map((c) => (
        <Button key={c.label} size="sm" variant="outline" onClick={() => set(c.clear)}>
          {c.label} <X size={12} aria-label={`Remove ${c.label} scope`} />
        </Button>
      ))}
    </div>
  );
}

function ProFilters({
  filters,
  set,
  isPro,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  isPro: boolean;
}) {
  const disabled = !isPro;
  const [q, setQ] = useState(filters.q ?? "");
  useEffect(() => setQ(filters.q ?? ""), [filters.q]);
  const applyQ = () => set({ q: q.trim().length >= 2 ? q : undefined });
  return (
    <Section
      title="Pro filters"
      aside={
        !isPro && (
          <Link
            href="/account"
            className="inline-flex items-center gap-1 text-xs text-accent underline"
          >
            <Lock size={12} aria-hidden /> Go Pro
          </Link>
        )
      }
    >
      <fieldset
        disabled={disabled}
        className={cn("space-y-3", disabled && "opacity-60")}
        aria-label="Pro filters"
      >
        {!isPro && <p className="text-xs text-ink-2">{PRO_FILTERS_BLURB} Listening stays free.</p>}
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            applyQ();
          }}
        >
          <label className="space-y-1" htmlFor="keywords">
            <span className="text-xs text-ink-2">Keywords</span>
          </label>
          <Input
            id="keywords"
            type="search"
            placeholder="drum break, psych, Latin…"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
            onBlur={applyQ}
            aria-describedby="keywords-help"
          />
          <p id="keywords-help" className="text-xs text-ink-2">
            Matches record, artist, label, track and style names, and the video's title and tags.
          </p>
        </form>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={filters.topicOnly ?? false}
            onChange={(e) => set({ topicOnly: e.target.checked || undefined })}
          />
          Topic channels only (official audio uploads)
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-ink-2">
            Deep cut ≥ {Math.round((filters.deepCutMin ?? 0) * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            className="w-full accent-[var(--accent)]"
            value={Math.round((filters.deepCutMin ?? 0) * 100)}
            onChange={(e) => set({ deepCutMin: Number(e.target.value) / 100 || undefined })}
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs text-ink-2">Format notes</span>
          <div className="flex flex-wrap gap-3">
            {["Promo", "Test Pressing", "White Label", "Limited Edition", "Reissue"].map((d) => (
              <label key={d} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={filters.formatDescriptions?.includes(d) ?? false}
                  onChange={() =>
                    set({ formatDescriptions: toggle(filters.formatDescriptions, d) })
                  }
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-2">
          "More from this release, channel, label or artist" lives on the record panel.
        </p>
      </fieldset>
    </Section>
  );
}

function SavedFilters({
  filters,
  onApply,
  isPro,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  isPro: boolean;
}) {
  const [items, setItems] = useState<SavedFilter[] | null>(null);
  const [max, setMax] = useState(200);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .savedFilters()
      .then((r) => {
        setItems(r.items);
        setMax(r.max);
      })
      .catch(() => setItems([]));
  }, []);
  const empty = isEmptyFilter(filters);
  const save = async () => {
    setError(null);
    try {
      const saved = await api.saveFilter({ name: name.trim(), filters });
      setItems((prev) =>
        [...(prev ?? []).filter((i) => i.name !== saved.name), saved].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save these filters.");
    }
  };
  return (
    <Section
      title="Saved filters"
      aside={
        items && (
          <span className="tabular-nums text-xs text-ink-2">
            {items.length}/{max}
          </span>
        )
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !empty) void save();
        }}
      >
        <Input
          placeholder={empty ? "Set some filters first" : "Name these filters"}
          value={name}
          maxLength={60}
          disabled={empty}
          onChange={(e) => setName(e.target.value)}
          aria-label="Saved filter name"
        />
        <Button type="submit" size="sm" disabled={empty || !name.trim()}>
          Save
        </Button>
      </form>
      {error && (
        <p role="status" className="text-xs text-warn">
          {error}
        </p>
      )}
      <ul className="space-y-1" data-testid="saved-filters">
        {items?.map((it) => {
          const locked = !isPro && proFiltersUsed(it.filters).length > 0;
          return (
            <li key={it.id} className="flex items-center gap-2">
              <button
                type="button"
                className={cn("flex-1 truncate text-left underline", locked && "text-ink-2")}
                onClick={() =>
                  locked ? setError("That preset uses Pro filters.") : onApply(it.filters)
                }
                title={locked ? "Uses Pro filters" : "Apply"}
              >
                {locked && <Lock size={12} className="mr-1 inline" aria-hidden />}
                {it.name}
              </button>
              <button
                type="button"
                className="text-ink-2 hover:text-ink"
                aria-label={`Delete ${it.name}`}
                onClick={async () => {
                  setError(null);
                  try {
                    await api.deleteSavedFilter(it.id);
                    // Gone from the list only once the server has deleted it.
                    setItems((prev) => prev?.filter((x) => x.id !== it.id) ?? null);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : `Couldn't delete ${it.name}.`);
                  }
                }}
              >
                <X size={14} />
              </button>
            </li>
          );
        })}
        {items?.length === 0 && <li className="text-xs text-ink-2">No saved filters yet.</li>}
      </ul>
    </Section>
  );
}
