"use client";

import {
  ApiError,
  type RecordDetail,
  type ShufflePick,
  type StylesResponse,
} from "@app/api-client";
import {
  type Filters,
  filtersFromSearchParams,
  filtersToSearchParams,
  formatDuration,
  normalizeFilters,
  stableStringify,
} from "@app/core";
import { Bookmark, Gauge, NotebookPen, Shuffle, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { FilterDrawer } from "@/components/FilterDrawer";
import { NotePanel } from "@/components/NotePanel";
import { Player, type PlayerRequest } from "@/components/Player";
import { RecordPanel } from "@/components/RecordPanel";
import { SaveToCrate } from "@/components/SaveToCrate";
import { TempoVotePanel } from "@/components/TempoVotePanel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { seenVideos, sessionRecords } from "@/lib/local-lists";
import { useViewer } from "@/lib/viewer";

const START_KEY = "crate.startSeconds";
const START_OPTIONS = [0, 15, 30, 60];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function readStart(): number {
  try {
    const v = Number(window.localStorage.getItem(START_KEY));
    return START_OPTIONS.includes(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function DigScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { me, isPro, loading: viewerLoading } = useViewer();

  const [filters, setFilters] = useState<Filters>(() => {
    const parsed = filtersFromSearchParams((n) => params.getAll(n));
    return parsed.success ? parsed.data : {};
  });
  const [census, setCensus] = useState<StylesResponse | null>(null);
  const [current, setCurrent] = useState<ShufflePick | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [request, setRequest] = useState<PlayerRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [startSeconds, setStartSeconds] = useState(0);
  const tokenRef = useRef(0);
  const positionRef = useRef(0);
  const nextRef = useRef<{ pick: ShufflePick; key: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterKey = stableStringify(normalizeFilters(filters));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => setStartSeconds(readStart()), []);

  const exclusions = useCallback(
    () => ({ session: sessionRecords.get(), seen: me ? [] : seenVideos.get() }),
    [me],
  );

  const fetchPick = useCallback(
    async (f: Filters): Promise<ShufflePick | null> => {
      try {
        const res = await api.shuffle(f, exclusions());
        return res.pick;
      } catch (err) {
        setNotice(err instanceof ApiError ? err.message : "Couldn't reach the crate. Try again.");
        return null;
      }
    },
    [exclusions],
  );

  const prefetch = useCallback(async () => {
    const f = filtersRef.current;
    const key = stableStringify(normalizeFilters(f));
    const pick = await fetchPick(f);
    if (!pick) return;
    nextRef.current = { pick, key };
    // Preload only the next pick's data and thumbnail, never a second player.
    if (pick.thumbnailUrl) {
      const img = new Image();
      img.src = pick.thumbnailUrl;
    }
  }, [fetchPick]);

  const show = useCallback(
    (pick: ShufflePick, play: boolean) => {
      setCurrent(pick);
      setDetail(null);
      setEmpty(false);
      setSaveOpen(false);
      setNoteOpen(false);
      setTempoOpen(false);
      sessionRecords.add(pick.recordKey);
      if (!me) seenVideos.add(pick.videoId);
      tokenRef.current += 1;
      positionRef.current = 0;
      setRequest({
        videoId: pick.videoId,
        token: tokenRef.current,
        play,
        startSeconds: readStart(),
      });
      api
        .record(pick.recordKey)
        .then(setDetail)
        .catch(() => setDetail(null));
    },
    [me],
  );

  const next = useCallback(
    async (play: boolean) => {
      setBusy(true);
      try {
        const key = stableStringify(normalizeFilters(filtersRef.current));
        const queued = nextRef.current;
        nextRef.current = null;
        const pick =
          queued && queued.key === key ? queued.pick : await fetchPick(filtersRef.current);
        if (pick) {
          show(pick, play);
          void prefetch();
        } else {
          setEmpty(true);
        }
      } finally {
        setBusy(false);
      }
    },
    [fetchPick, prefetch, show],
  );

  // First pick on arrival: cued, not autoplayed. Playback starts on a tap or click.
  const started = useRef(false);
  useEffect(() => {
    if (viewerLoading || started.current) return;
    started.current = true;
    api
      .styles()
      .then(setCensus)
      .catch(() => setCensus(null));
    void next(false);
  }, [viewerLoading, next]);

  // Keep the URL in step with the filters so a dig can be shared or bookmarked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey stands in for filters
  useEffect(() => {
    nextRef.current = null;
    const qs = filtersToSearchParams(filters)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filterKey]);

  const onUnplayable = useCallback(
    (videoId: string, code: number) => {
      void api.report(videoId, code).catch(() => undefined);
      setNotice("That video can't play here, so it was skipped and reported.");
      void next(true);
    },
    [next],
  );

  const onPlayLogged = useCallback(
    (videoId: string, seconds: number) => {
      if (!current || current.videoId !== videoId) return;
      void api.logPlay({ recordKey: current.recordKey, videoId, seconds }).catch(() => undefined);
    },
    [current],
  );

  // Shortcuts: N next, S save, E note, / filter search. Ignored while typing; keys pressed
  // inside the player's iframe never reach this page, so the player keeps its own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        void next(true);
      } else if ((e.key === "s" || e.key === "S") && current) {
        e.preventDefault();
        setSaveOpen(true);
      } else if ((e.key === "e" || e.key === "E") && current && isPro) {
        e.preventDefault();
        setNoteOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setFiltersOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, current, isPro]);

  const scope = (s: { labelId?: number; artistId?: number }) => {
    setFilters((f) =>
      normalizeFilters({
        ...f,
        ...(s.labelId ? { labelIds: [s.labelId] } : {}),
        ...(s.artistId ? { artistIds: [s.artistId] } : {}),
      }),
    );
    setNotice("Scope set. Shuffle to dig inside it.");
  };

  return (
    <div
      className={cn(
        "grid gap-6",
        "[grid-template-areas:'player'_'filters'_'record']",
        "lg:grid-cols-[minmax(0,1fr)_320px] lg:[grid-template-areas:'player_filters'_'record_filters']",
      )}
    >
      <section className="min-w-0 space-y-3 [grid-area:player]" aria-label="Player">
        {request ? (
          <Player
            request={request}
            title={current ? `${current.record.artist} – ${current.record.title}` : undefined}
            onUnplayable={onUnplayable}
            onPlayLogged={onPlayLogged}
            onProgress={(t) => {
              positionRef.current = t;
            }}
          />
        ) : (
          <div className="flex aspect-video w-full min-h-[200px] items-center justify-center rounded-md border border-dashed border-line text-ink-2 md:min-h-[270px]">
            {empty
              ? "Nothing matches these filters yet. Loosen them and shuffle again."
              : "Finding a record…"}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void next(true)}
            disabled={busy}
            data-testid="shuffle"
          >
            <Shuffle size={18} aria-hidden /> Shuffle
            <kbd className="ml-1 hidden rounded border border-accent-ink/30 px-1 text-xs sm:inline">
              N
            </kbd>
          </Button>
          <Button onClick={() => setSaveOpen((o) => !o)} disabled={!current} data-testid="save">
            <Bookmark size={16} aria-hidden /> Save
          </Button>
          <Button
            onClick={() => setNoteOpen((o) => !o)}
            disabled={!current || !isPro}
            title={isPro ? "Timestamped note (E)" : "Timestamped notes are a Pro tool"}
          >
            <NotebookPen size={16} aria-hidden /> Note
          </Button>
          <Button
            onClick={() => setTempoOpen((o) => !o)}
            disabled={!current || !isPro}
            title={isPro ? "Tap tempo and key votes" : "Tempo and key votes are a Pro tool"}
          >
            <Gauge size={16} aria-hidden /> Tempo
          </Button>
          <Button
            className="lg:hidden"
            variant="outline"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={16} aria-hidden /> Filters
          </Button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-2">
            Start at
            <select
              className="rounded border border-line bg-surface px-1 py-0.5"
              value={startSeconds}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStartSeconds(v);
                try {
                  window.localStorage.setItem(START_KEY, String(v));
                } catch {
                  // ignore
                }
              }}
            >
              {START_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? "the top" : formatDuration(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {notice && (
          <p role="status" className="text-sm text-warn">
            {notice}{" "}
            <button type="button" className="underline" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </p>
        )}
        {current && (
          <SaveToCrate
            item={{ recordKey: current.recordKey, videoId: current.videoId }}
            seedFilters={isPro ? filters : null}
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            onSaved={(name) => setNotice(`Saved to ${name}.`)}
          />
        )}
        {current && isPro && (
          <TempoVotePanel
            open={tempoOpen}
            onClose={() => setTempoOpen(false)}
            releaseId={current.releaseId}
            track={current.track}
          />
        )}
        {current && isPro && (
          <NotePanel
            open={noteOpen}
            onClose={() => setNoteOpen(false)}
            recordKey={current.recordKey}
            videoId={current.videoId}
            getPosition={() => positionRef.current}
          />
        )}
      </section>

      <aside
        className={cn("[grid-area:filters] lg:block", filtersOpen ? "block" : "hidden")}
        aria-label="Filters"
      >
        <div className="rounded-lg border border-line bg-surface p-4">
          <FilterDrawer
            filters={filters}
            onChange={setFilters}
            census={census}
            isPro={isPro}
            searchRef={searchRef}
          />
        </div>
      </aside>

      <section className="min-w-0 space-y-6 [grid-area:record]" aria-label="Record">
        {current && <RecordPanel pick={current} detail={detail} canScope={isPro} onScope={scope} />}
        <AdSlot />
      </section>
    </div>
  );
}
