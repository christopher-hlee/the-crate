"use client";

import { ApiError, type Asset, type Crate } from "@app/api-client";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { ArchivePlayer } from "@/components/ArchivePlayer";
import { Sleeve } from "@/components/Sleeve";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useViewer } from "@/lib/viewer";

function Rights({ asset }: { asset: Asset }) {
  const r = asset.rights;
  return (
    <section
      className="space-y-1 rounded-md border border-line p-3 text-sm"
      aria-label="Rights"
      data-testid="rights"
    >
      <p>
        <span className="text-ink-2">Rights basis:</span> {r.basisLabel}
        {r.recordingYear ? ` · published ${r.recordingYear}` : ""}
      </p>
      {r.attribution && (
        <p>
          <span className="text-ink-2">Credit:</span> {r.attribution}
        </p>
      )}
      {r.dateEvidence.map((e) => (
        <p key={e.citation} className="text-ink-2">
          Date evidence:{" "}
          {e.url ? (
            <a href={e.url} className="underline" target="_blank" rel="noopener">
              {e.citation}
            </a>
          ) : (
            e.citation
          )}
        </p>
      ))}
      <p className="flex flex-wrap gap-x-4">
        <a
          href={r.sourceUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-accent underline"
        >
          Source <ExternalLink size={12} aria-hidden />
        </a>
        {r.licenseUrl && (
          <a
            href={r.licenseUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-accent underline"
          >
            Licence <ExternalLink size={12} aria-hidden />
          </a>
        )}
      </p>
    </section>
  );
}

function SaveAsset({ asset }: { asset: Asset }) {
  const { me } = useViewer();
  const [crates, setCrates] = useState<Crate[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  if (!me) return null;
  if (!crates)
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void api.crates().then((r) => setCrates(r.crates))}
      >
        Save to crate
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="save-asset">
      {crates.length === 0 && (
        <span className="text-ink-2">Make a crate first on the Crates page.</span>
      )}
      {crates.map((c) => (
        <Button
          key={c.id}
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await api.addCrateAsset(c.id, asset.id);
              setStatus(`Saved to ${c.name}.`);
            } catch (err) {
              setStatus(err instanceof ApiError ? err.message : "Couldn't save it.");
            }
          }}
        >
          {c.name}
        </Button>
      ))}
      {status && <span role="status">{status}</span>}
    </div>
  );
}

export function ArchiveScreen() {
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Archive (preview)";
    const t = setTimeout(() => {
      api
        .assets({ q: query })
        .then((r) => {
          setAssets(r.assets);
          setSelected((s) => s ?? r.assets[0] ?? null);
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : "Couldn't load the archive."),
        );
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Archive</h1>
        <p className="text-sm text-ink-2">
          Recordings we host ourselves: US recordings published in or before the public-domain year,
          and Creative Commons recordings (CC0, BY, BY-SA). Each one shows its rights basis and
          source. Preview: not listed yet.
        </p>
      </div>
      {error && <p className="text-warn">{error}</p>}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artist or title"
            aria-label="Search the archive"
          />
          <ul
            className="divide-y divide-line rounded-md border border-line"
            data-testid="archive-list"
          >
            {assets?.length === 0 && (
              <li className="px-3 py-4 text-sm text-ink-2">Nothing here yet.</li>
            )}
            {assets?.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2",
                    selected?.id === a.id && "bg-surface-2",
                  )}
                  onClick={() => setSelected(a)}
                  aria-current={selected?.id === a.id ? "true" : undefined}
                >
                  <Sleeve
                    label={a.label}
                    catno={a.catno}
                    year={a.year}
                    styles={a.styles}
                    size={40}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.title}</span>
                    <span className="block truncate text-xs text-ink-2">
                      {[a.artist, a.year, a.rights.basisLabel].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {selected && (
          <article className="space-y-4" aria-label={`${selected.artist} – ${selected.title}`}>
            <header className="flex items-center gap-4">
              <Sleeve
                label={selected.label}
                catno={selected.catno}
                year={selected.year}
                styles={selected.styles}
                size={96}
              />
              <div>
                <p className="text-sm text-ink-2">{selected.artist}</p>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="text-sm text-ink-2">
                  {[
                    selected.label &&
                      `${selected.label}${selected.catno ? ` · ${selected.catno}` : ""}`,
                    selected.year,
                    selected.bpm ? `${Math.round(selected.bpm)} BPM` : null,
                    selected.camelotKey,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </header>
            <ArchivePlayer asset={selected} />
            <SaveAsset asset={selected} />
            <Rights asset={selected} />
          </article>
        )}
      </div>
    </div>
  );
}
