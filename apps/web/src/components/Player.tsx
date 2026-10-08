"use client";

// The one YouTube player on a screen. Hard rules (docs/SPEC.md "Player rules"):
// - loaded from https://www.youtube.com/iframe_api once, one player, reused with
//   loadVideoById / cueVideoById;
// - only playsinline, controls, rel: 0 and origin;
// - 16:9, at least 480×270 on desktop, full width on phones, never under 200×200;
// - playback starts on a tap or click; autoplay only while more than half is visible;
// - nothing is ever drawn over the iframe, and neither it nor its ancestors are made inert
//   or pointer-events: none (apps/web/e2e/compliance.spec.ts checks this);
// - error codes 2, 5, 100, 101, 150 are reported and skipped;
// - a play is logged after 5 seconds of playback.

import {
  AUTOPLAY_VISIBLE_RATIO,
  IFRAME_API_URL,
  isReportablePlayerError,
  PLAY_LOG_AFTER_SECONDS,
  PLAYER_STATE,
  PLAYER_VARS,
} from "@app/core";
import { useEffect, useRef } from "react";

type YTPlayer = {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      width: string;
      height: string;
      videoId?: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the IFrame API script once per page. */
export function loadIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${IFRAME_API_URL}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

export type PlayerRequest = {
  videoId: string;
  /** Bumped on every request so the same video can be reloaded. */
  token: number;
  /** The user asked for playback (Shuffle, N, a list item). Still needs >50% visibility. */
  play: boolean;
  startSeconds?: number;
};

type Props = {
  request: PlayerRequest | null;
  onPlayLogged?: (videoId: string, seconds: number) => void;
  onUnplayable?: (videoId: string, code: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Current position in seconds, about once a second while playing. */
  onProgress?: (seconds: number) => void;
  /** The video finished. Callers may load the next one; it autoplays only if >50% is visible. */
  onEnded?: (videoId: string) => void;
  title?: string;
};

export function Player({
  request,
  onPlayLogged,
  onUnplayable,
  onPlayingChange,
  onProgress,
  onEnded,
  title,
}: Props) {
  const boxRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<PlayerRequest | null>(null);
  const visibleRef = useRef(0);
  const currentRef = useRef<string | null>(null);
  const playedRef = useRef({ seconds: 0, logged: false });
  const callbacks = useRef({ onPlayLogged, onUnplayable, onPlayingChange, onProgress, onEnded });
  callbacks.current = { onPlayLogged, onUnplayable, onPlayingChange, onProgress, onEnded };

  const apply = (req: PlayerRequest) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) {
      pendingRef.current = req;
      return;
    }
    currentRef.current = req.videoId;
    playedRef.current = { seconds: 0, logged: false };
    const args = { videoId: req.videoId, startSeconds: req.startSeconds ?? 0 };
    // A hidden tab counts as not visible: browsers stop intersection updates for hidden pages,
    // so the last ratio would otherwise let an auto-advance start playing in the background.
    const visible =
      document.visibilityState === "visible" && visibleRef.current > AUTOPLAY_VISIBLE_RATIO;
    if (req.play && visible) player.loadVideoById(args);
    else player.cueVideoById(args);
  };

  // Track how much of the player is on screen; autoplay needs more than half.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visibleRef.current = e.intersectionRatio;
          // Exposed for the compliance tests' autoplay checks.
          el.dataset.visible = e.intersectionRatio.toFixed(2);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.51, 0.75, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Create the one player on first request; later requests reuse it.
  const firstVideo = request?.videoId ?? null;
  const hasRequest = request !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: created once; later requests go through apply()
  useEffect(() => {
    if (!hasRequest || playerRef.current || !mountRef.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    void loadIframeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      playerRef.current = new YT.Player(mountRef.current, {
        width: "100%",
        height: "100%",
        playerVars: { ...PLAYER_VARS, origin: window.location.origin },
        events: {
          onReady: () => {
            readyRef.current = true;
            const pending = pendingRef.current;
            pendingRef.current = null;
            if (pending) apply(pending);
          },
          onStateChange: (e) => {
            const playing = e.data === PLAYER_STATE.playing;
            callbacks.current.onPlayingChange?.(playing);
            if (e.data === PLAYER_STATE.ended && currentRef.current) {
              callbacks.current.onEnded?.(currentRef.current);
            }
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
            if (playing) {
              // Count real playback time, not wall-clock time since load.
              timer = setInterval(() => {
                const p = playedRef.current;
                p.seconds += 1;
                const t = playerRef.current?.getCurrentTime();
                if (typeof t === "number") callbacks.current.onProgress?.(t);
                const id = currentRef.current;
                if (!p.logged && id && p.seconds >= PLAY_LOG_AFTER_SECONDS) {
                  p.logged = true;
                  callbacks.current.onPlayLogged?.(id, p.seconds);
                }
              }, 1000);
            }
          },
          onError: (e) => {
            const id = currentRef.current;
            if (id && isReportablePlayerError(e.data)) callbacks.current.onUnplayable?.(id, e.data);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [hasRequest]);

  // Apply each new request (new video, or the same video requested again).
  const token = request?.token;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the token identifies each request
  useEffect(() => {
    if (request) apply(request);
  }, [token, firstVideo]);

  useEffect(
    () => () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
    },
    [],
  );

  return (
    <section
      ref={boxRef}
      data-player-box=""
      className="aspect-video w-full min-h-[200px] min-w-[200px] bg-black md:min-h-[270px] md:min-w-[480px]"
      aria-label={title ? `YouTube player: ${title}` : "YouTube player"}
    >
      {/* The IFrame API replaces this element with the iframe. Nothing else goes in here. */}
      <div ref={mountRef} className="h-full w-full" />
    </section>
  );
}
