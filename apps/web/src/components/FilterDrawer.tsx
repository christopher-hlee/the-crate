"use client";

import type { CountResponse, StylesResponse } from "@app/api-client";
import { type Filters, normalizeFilters } from "@app/core";
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
  searchRef: RefObject<HTMLInputElement | null>;
};

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

export function FilterDrawer({ filters, onChange, census, isPro, searchRef }: Props) {
  const [query, setQuery] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [count, setCount] = useState<CountResponse | null>(null);
  const set = (patch: Partial<Filters>) => onChange(normalizeFilters({ ...filters, ...patch }));

  // Live match count for the combined filters, debounced.
  const key = JSON.stringify(normalizeFilters(filters));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the normalized filters
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .count(filters)
        .then((c) => !cancelled && setCount(c))
        .catch(() => !cancelled && setCount(null));
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

      <ProFilters
        filters={filters}
        set={set}
        isPro={isPro}
        coverage={count?.tempoCoverage ?? null}
      />
    </div>
  );
}

function ProFilters({
  filters,
  set,
  isPro,
  coverage,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  isPro: boolean;
  coverage: number | null;
}) {
  const disabled = !isPro;
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
        {!isPro && (
          <p className="text-xs text-ink-2">
            Tempo, key, views, deep-cut, format notes and label or artist scopes are Pro tools.
            Listening stays free.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-ink-2">BPM from</span>
            <Input
              type="number"
              min={20}
              max={400}
              value={filters.bpmFrom ?? ""}
              onChange={(e) =>
                set({ bpmFrom: e.target.value ? Number(e.target.value) : undefined })
              }
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
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-ink-2">Max YouTube views</span>
            <Input
              type="number"
              min={0}
              value={filters.maxViews ?? ""}
              onChange={(e) =>
                set({ maxViews: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </label>
          <label className="space-y-1">
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
        </div>
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
        {(filters.labelIds || filters.artistIds) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {filters.labelIds && (
              <Button size="sm" variant="outline" onClick={() => set({ labelIds: undefined })}>
                Label scope on <X size={12} />
              </Button>
            )}
            {filters.artistIds && (
              <Button size="sm" variant="outline" onClick={() => set({ artistIds: undefined })}>
                Artist scope on <X size={12} />
              </Button>
            )}
          </div>
        )}
      </fieldset>
    </Section>
  );
}
