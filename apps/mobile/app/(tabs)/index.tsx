// Dig: the player on top (outside any scroll view, so it is always fully on screen while
// this tab is focused), the pick card below it, then the controls and inline panels. Nothing
// is ever drawn over the player, and no gesture handler wraps it.

import {
  ApiError,
  type RecordDetail,
  type ShufflePick,
  type StylesResponse,
} from "@app/api-client";
import { type Filters, normalizeFilters, stableStringify } from "@app/core";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Comments } from "../../src/components/Comments";
import { FilterPanel } from "../../src/components/FilterPanel";
import { HeartButton } from "../../src/components/HeartButton";
import { NotePanel } from "../../src/components/NotePanel";
import { OfflineState } from "../../src/components/OfflineBanner";
import { RecordDetails } from "../../src/components/RecordPanel";
import { SavePanel } from "../../src/components/SavePanel";
import { Sleeve } from "../../src/components/Sleeve";
import { Button, Notice } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";
import { config } from "../../src/lib/config";
import { errorMessage } from "../../src/lib/errors";
import { seenVideos, sessionRecords } from "../../src/lib/exclusions";
import { favoriteStore } from "../../src/lib/favorites";
import { isNextSwipe } from "../../src/lib/gestures";
import { useOnline } from "../../src/lib/online";
import { scopeLabel, withoutScopes } from "../../src/lib/scopes";
import { useIsFavorite, useToggleFavorite } from "../../src/lib/useFavorite";
import { type PlayerHandle, PlayerWebView } from "../../src/player/PlayerWebView";

type Panel = "filters" | "save" | "note" | null;

export default function DigScreen() {
  const { api, me, loading } = useAuth();
  const online = useOnline();
  const player = useRef<PlayerHandle>(null);
  const scroll = useRef<ScrollView>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [census, setCensus] = useState<StylesResponse | null>(null);
  const [matches, setMatches] = useState<string | null>(null);
  const [current, setCurrent] = useState<ShufflePick | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const nextRef = useRef<{ pick: ShufflePick; key: string } | null>(null);
  const lastCrate = useRef<{ id: string; name: string } | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const currentRef = useRef(current);
  currentRef.current = current;
  const filterKey = stableStringify(normalizeFilters(filters));
  const toggleFavorite = useToggleFavorite();
  const favorited = useIsFavorite(current, current?.favorited ?? false);
  // Plans without crates (Free) favorite on a long-press instead of saving to a crate.
  const hasCrates = me ? me.limits.maxCrates !== 0 : false;

  const fetchPick = useCallback(
    async (f: Filters): Promise<ShufflePick | null> => {
      try {
        const res = await api.shuffle(f, {
          session: sessionRecords.get(),
          seen: me ? [] : seenVideos.get(),
        });
        return res.pick;
      } catch (err) {
        setNotice(err instanceof ApiError ? err.message : "Couldn't reach the crate. Try again.");
        return null;
      }
    },
    [api, me],
  );

  const prefetch = useCallback(async () => {
    const f = filtersRef.current;
    const pick = await fetchPick(f);
    if (!pick) return;
    nextRef.current = { pick, key: stableStringify(normalizeFilters(f)) };
    // Preload only the next pick's data and thumbnail, never a second player.
    if (pick.thumbnailUrl) void Image.prefetch(pick.thumbnailUrl).catch(() => false);
  }, [fetchPick]);

  const show = useCallback(
    (pick: ShufflePick, play: boolean) => {
      setCurrent(pick);
      setDetail(null);
      setEmpty(false);
      setPanel((p) => (p === "filters" ? p : null));
      sessionRecords.add(pick.recordKey);
      if (me) favoriteStore.set(pick, pick.favorited);
      else seenVideos.add(pick.videoId);
      // Playback only follows a tap or swipe; the first pick on arrival is cued.
      player.current?.load(pick.videoId, { autoplay: play });
      api
        .record(pick.recordKey)
        .then(setDetail)
        .catch(() => setDetail(null));
    },
    [api, me],
  );

  const next = useCallback(
    async (play: boolean) => {
      setBusy(true);
      setNotice(null);
      try {
        const key = stableStringify(normalizeFilters(filtersRef.current));
        const queued = nextRef.current;
        nextRef.current = null;
        const pick =
          queued && queued.key === key ? queued.pick : await fetchPick(filtersRef.current);
        if (pick) {
          show(pick, play);
          void prefetch();
        } else setEmpty(true);
      } finally {
        setBusy(false);
      }
    },
    [fetchPick, prefetch, show],
  );

  const started = useRef(false);
  useEffect(() => {
    if (loading || !online || started.current) return;
    started.current = true;
    api
      .styles()
      .then(setCensus)
      .catch(() => setCensus(null));
    void next(false);
  }, [api, loading, online, next]);

  // Going offline unmounts the player (the YouTube lane has no offline mode). When the
  // connection returns, the new player starts empty: cue the pick it lost, without playing.
  useEffect(() => {
    if (!online) return;
    const pick = currentRef.current;
    if (pick) player.current?.load(pick.videoId, { autoplay: false });
  }, [online]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey stands in for filters
  useEffect(() => {
    nextRef.current = null;
    if (!started.current) return;
    api
      .count(filtersRef.current)
      .then((c) => setMatches(c.display))
      .catch(() => setMatches(null));
  }, [filterKey]);

  // Leaving the tab pauses the player; it never plays where it can't be seen.
  useFocusEffect(useCallback(() => () => player.current?.pause(), []));

  /** The heart: toggles, or (long-press on plans without crates) only adds. */
  const favorite = useCallback(
    async (mode: "toggle" | "add") => {
      if (!current) return;
      if (!me) {
        setPanel("save");
        return;
      }
      const isFavorite = favoriteStore.get(current) ?? current.favorited;
      if (mode === "add" && isFavorite) {
        setNotice("Already in your favorites.");
        return;
      }
      const result = await toggleFavorite(current, isFavorite);
      if (!result.ok) {
        if (result.error) setNotice(result.error);
        return;
      }
      if (mode === "add") setNotice("Added to favorites.");
    },
    [current, me, toggleFavorite],
  );

  const quickSave = useCallback(async () => {
    if (!current) return;
    if (!me) {
      setPanel("save");
      return;
    }
    if (!hasCrates) {
      await favorite("add");
      return;
    }
    const crate = lastCrate.current;
    if (!crate) {
      setPanel("save");
      return;
    }
    try {
      await api.addItem(crate.id, { recordKey: current.recordKey, videoId: current.videoId });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(`Saved to ${crate.name}.`);
    } catch (err) {
      setNotice(errorMessage(err, "Couldn't save. Try again."));
    }
  }, [api, current, me, hasCrates, favorite]);

  /** "More from…" and its way back: replace the filters and shuffle. */
  const applyScope = useCallback(
    (f: Filters) => {
      setFilters(f);
      filtersRef.current = f;
      nextRef.current = null;
      setPanel(null);
      scroll.current?.scrollTo({ y: 0, animated: true });
      void next(true);
    },
    [next],
  );

  const actions = useRef({ next, quickSave });
  actions.current = { next, quickSave };
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-20, 20])
      .activeOffsetY([-20, 20])
      .onEnd((e) => {
        if (!isNextSwipe(e)) return;
        void Haptics.selectionAsync();
        void actions.current.next(true);
      });
    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(450)
      .onStart(() => void actions.current.quickSave());
    return Gesture.Exclusive(pan, hold);
  }, []);

  if (!online)
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        <OfflineState />
      </SafeAreaView>
    );

  const r = current?.record;
  const scope = scopeLabel(filters);
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <PlayerWebView
        ref={player}
        appId={config.appId}
        onPlayLogged={(videoId, seconds) => {
          if (current?.videoId === videoId)
            void api
              .logPlay({ recordKey: current.recordKey, videoId, seconds })
              .catch(() => undefined);
        }}
        onUnplayable={(videoId, code) => {
          void api.report(videoId, code).catch(() => undefined);
          void next(true).then(() =>
            setNotice("That video can't play here, so it was skipped and reported."),
          );
        }}
      />
      <View className="flex-row items-center border-b border-line bg-surface pr-2">
        <GestureDetector gesture={gesture}>
          <View
            testID="pick-card"
            accessibilityHint={`Swipe left or up for the next record. Press and hold to ${me && !hasCrates ? "favorite" : "save"}.`}
            className="flex-1 flex-row items-center py-3 pl-4"
          >
            {r ? (
              <Sleeve label={r.label} catno={r.catno} year={r.year} styles={r.styles} size={64} />
            ) : (
              <View className="h-16 w-16 rounded bg-surface-2" />
            )}
            <View className="ml-3 flex-1">
              <Text numberOfLines={1} className="text-sm text-ink-2">
                {r?.artist ?? (empty ? "Nothing here" : "…")}
              </Text>
              <Text
                testID="pick-title"
                numberOfLines={2}
                className="text-lg font-semibold text-ink"
              >
                {r?.title ?? (empty ? "No records match these filters" : "Finding a record")}
              </Text>
              {r ? (
                <Text numberOfLines={1} className="text-xs text-ink-2">
                  {[r.label && `${r.label}${r.catno ? ` · ${r.catno}` : ""}`, r.year, r.country]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        {current ? (
          <HeartButton
            testID="favorite"
            large
            favorited={me ? favorited : false}
            onPress={() => void favorite("toggle")}
          />
        ) : null}
      </View>
      {scope ? (
        <View testID="scope-bar" className="flex-row items-center justify-between px-4 pt-2">
          <Text className="text-xs text-ink-2">{scope}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => applyScope(withoutScopes(filters))}
            hitSlop={8}
          >
            <Text className="text-xs text-accent underline">Back to everything</Text>
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2 px-4 py-3">
        <Button
          testID="shuffle"
          variant="primary"
          label="Shuffle"
          busy={busy}
          onPress={() => void next(true)}
        />
        <Button
          testID="save"
          label="Save"
          disabled={!current}
          onPress={() => setPanel(panel === "save" ? null : "save")}
        />
        <Button
          testID="filters"
          label="Filters"
          onPress={() => setPanel(panel === "filters" ? null : "filters")}
        />
        {me?.limits.notes ? (
          <Button
            testID="note"
            label="Note"
            disabled={!current}
            onPress={() => setPanel(panel === "note" ? null : "note")}
          />
        ) : null}
      </View>
      <ScrollView ref={scroll} className="flex-1 px-4" keyboardShouldPersistTaps="handled">
        {notice ? <Notice>{notice}</Notice> : null}
        {empty ? <Notice>Nothing matches. Loosen a filter, or clear them all.</Notice> : null}
        {panel === "filters" ? (
          <FilterPanel
            census={census}
            filters={filters}
            onChange={setFilters}
            proFilters={Boolean(me?.limits.proFilters)}
            matches={matches}
          />
        ) : null}
        {panel === "save" && current ? (
          <SavePanel
            item={{ recordKey: current.recordKey, videoId: current.videoId }}
            favorited={favorited}
            onFavorite={() => void favorite("toggle")}
            onDone={(message, crate) => {
              setNotice(message);
              setPanel(null);
              // Long-press saves to this crate from now on.
              if (crate) lastCrate.current = crate;
            }}
          />
        ) : null}
        {panel === "note" && current ? (
          <NotePanel
            item={{ recordKey: current.recordKey, videoId: current.videoId }}
            position={() => player.current?.position() ?? 0}
            onDone={(message) => {
              setNotice(message);
              setPanel(null);
            }}
          />
        ) : null}
        {current ? (
          <RecordDetails
            pick={current}
            detail={detail}
            proFilters={Boolean(me?.limits.proFilters)}
            onScope={(s) => applyScope(s.filters)}
          />
        ) : null}
        {current ? <Comments recordKey={current.recordKey} /> : null}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
