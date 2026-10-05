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
  normalizeFilters,
  PRO_FILTER_KEYS,
  proFiltersUsed,
  stableStringify,
} from "@app/core";
import { Bookmark, Gauge, Heart, NotebookPen, Shuffle, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { CommentsPanel } from "@/components/CommentsPanel";
import { FilterDrawer } from "@/components/FilterDrawer";
import { NotePanel } from "@/components/NotePanel";
import { Player, type PlayerRequest } from "@/components/Player";
import { PlayerSettingsMenu } from "@/components/PlayerSettingsMenu";
import { RecordPanel, type Scope } from "@/components/RecordPanel";
import { SaveToCrate } from "@/components/SaveToCrate";
import { TempoVotePanel } from "@/components/TempoVotePanel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { seenVideos, sessionRecords } from "@/lib/local-lists";
import {
  DEFAULT_SETTINGS,
  type PlayerSettings,
  readSettings,
  startSecondsFor,
  writeSettings,
} from "@/lib/player-settings";
import { useViewer } from "@/lib/viewer";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
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
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [favorited, setFavorited] = useState(false);
  const tokenRef = useRef(0);
  const positionRef = useRef(0);
  const nextRef = useRef<{ pick: ShufflePick; key: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterKey = stableStringify(normalizeFilters(filters));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const heardRef = useRef(0);
  useEffect(() => setSettings(readSettings()), []);
  const updateSettings = (patch: Partial<PlayerSettings>) => {
    setSettings((prev) => {
      const nextSettings = { ...prev, ...patch };
      writeSettings(nextSettings);
      return nextSettings;
    });
    // Picks queued under the old replay setting may be stale.
    if ("repeats" in patch) nextRef.current = null;
  };

  // A Free account opening a link with Pro filters gets them removed, not a wall of errors.
  const limits = me?.limits;
  const signedIn = me !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once the viewer is known
  useEffect(() => {
    if (viewerLoading || isPro) return;
    const used = proFiltersUsed(filters);
    if (used.length === 0) return;
    const stripped: Filters = { ...filters };
    for (const k of PRO_FILTER_KEYS) delete stripped[k];
    setFilters(normalizeFilters(stripped));
    setNotice("This link used Pro filters, so they were left out. The rest of the dig is free.");
  }, [viewerLoading, isPro]);

  const exclusions = useCallback(
    () => ({
      session: sessionRecords.get(),
      seen: me || settingsRef.current.repeats ? [] : seenVideos.get(),
      repeats: settingsRef.current.repeats,
    }),
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
      setFavorited(pick.favorited);
      setDetail(null);
      setEmpty(false);
      setSaveOpen(false);
      setNoteOpen(false);
      setTempoOpen(false);
      sessionRecords.add(pick.recordKey);
      if (!me) seenVideos.add(pick.videoId);
      tokenRef.current += 1;
      positionRef.current = 0;
      heardRef.current = 0;
      setRequest({
        videoId: pick.videoId,
        token: tokenRef.current,
        play,
        startSeconds: startSecondsFor(settingsRef.current),
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

  const toggleFavorite = useCallback(async () => {
    if (!current) return;
    if (!me) {
      setNotice("Sign in to keep favorites: they're free.");
      return;
    }
    const ref = { recordKey: current.recordKey, videoId: current.videoId };
    const was = favorited;
    setFavorited(!was);
    try {
      const r = was ? await api.removeFavorite(ref) : await api.addFavorite(ref);
      setFavorited(r.favorited);
      if (!was) setNotice(`Added to favorites (${r.total.toLocaleString("en-US")}).`);
    } catch (err) {
      setFavorited(was);
      setNotice(err instanceof ApiError ? err.message : "Couldn't update favorites.");
    }
  }, [current, me, favorited]);

  const canCrate = (limits?.maxCrates ?? 0) > 0;

  // Shortcuts: N next, F favorite, S save (crate for Pro, favorite otherwise), E note,
  // / filter search. Ignored while typing; keys pressed inside the player's iframe never
  // reach this page, so the player keeps its own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        void next(true);
      } else if ((e.key === "f" || e.key === "F") && current) {
        e.preventDefault();
        void toggleFavorite();
      } else if ((e.key === "s" || e.key === "S") && current) {
        e.preventDefault();
        if (canCrate) setSaveOpen(true);
        else void toggleFavorite();
      } else if ((e.key === "e" || e.key === "E") && current && limits?.notes) {
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
  }, [next, current, canCrate, limits, toggleFavorite]);

  const scope = (s: Scope) => {
    setFilters((f) =>
      normalizeFilters({
        ...f,
        ...(s.labelId ? { labelIds: [s.labelId] } : {}),
        ...(s.artistId ? { artistIds: [s.artistId] } : {}),
        ...(s.recordKey ? { recordKeys: [s.recordKey] } : {}),
        ...(s.channelId ? { channelIds: [s.channelId] } : {}),
      }),
    );
    setNotice("Scope set. Shuffle to dig inside it.");
  };

  const addStyle = (style: string) => {
    setFilters((f) => normalizeFilters({ ...f, styles: [...(f.styles ?? []), style] }));
    setNotice(`Added ${style} to the filters. Shuffle to dig it.`);
  };

  const jumpTo = (seconds: number) => {
    if (!current) return;
    tokenRef.current += 1;
    setRequest({
      videoId: current.videoId,
      token: tokenRef.current,
      play: true,
      startSeconds: seconds,
    });
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
              // Called once per second of playback. "Skip after" moves on once, after that
              // many seconds heard; like the end of a video, it only autoplays while visible.
              heardRef.current += 1;
              const skip = settings.skipAfter;
              if (skip > 0 && heardRef.current === skip && !busy) void next(true);
            }}
            onEnded={() => {
              // The next pick only autoplays while more than half the player is visible.
              if (settings.autoAdvance) void next(true);
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
          <Button
            onClick={() => void toggleFavorite()}
            disabled={!current}
            aria-pressed={favorited}
            data-testid="favorite"
            title="Favorite (F)"
          >
            <Heart size={16} aria-hidden className={favorited ? "fill-accent text-accent" : ""} />
            {favorited ? "Favorited" : "Favorite"}
          </Button>
          <Button onClick={() => setSaveOpen((o) => !o)} disabled={!current} data-testid="save">
            <Bookmark size={16} aria-hidden /> {canCrate ? "Add to crate" : "Crates"}
          </Button>
          <Button
            onClick={() => setNoteOpen((o) => !o)}
            disabled={!current || !limits?.notes}
            title={limits?.notes ? "Timestamped note (E)" : "Sign in to take notes"}
          >
            <NotebookPen size={16} aria-hidden /> Note
          </Button>
          <Button
            onClick={() => setTempoOpen((o) => !o)}
            disabled={!current}
            title="Tap tempo and key votes"
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
          <PlayerSettingsMenu settings={settings} onChange={updateSettings} />
        </div>
        {notice && (
          <p role="status" className="text-sm text-warn">
            {notice}{" "}
            {!signedIn && notice.startsWith("Sign in") && (
              <Link href="/login?next=/" className="underline">
                Sign in
              </Link>
            )}{" "}
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
        {current && (
          <TempoVotePanel
            open={tempoOpen}
            onClose={() => setTempoOpen(false)}
            releaseId={current.releaseId}
            track={current.track}
            signedIn={signedIn}
          />
        )}
        {current && limits?.notes && (
          <NotePanel
            open={noteOpen}
            onClose={() => setNoteOpen(false)}
            recordKey={current.recordKey}
            videoId={current.videoId}
            getPosition={() => positionRef.current}
            onJump={jumpTo}
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
            signedIn={signedIn}
            searchRef={searchRef}
          />
        </div>
      </aside>

      <section className="min-w-0 space-y-6 [grid-area:record]" aria-label="Record">
        {current && (
          <RecordPanel
            pick={current}
            detail={detail}
            canScope={isPro}
            onScope={scope}
            onStyle={addStyle}
          />
        )}
        {current && !settings.hideComments && <CommentsPanel recordKey={current.recordKey} />}
        <AdSlot />
      </section>
    </div>
  );
}
