// The YouTube player on mobile: YouTube's official IFrame player inside the OS WebView.
// Rules: one player per screen, nothing drawn over it, at least 200×200, inline playback,
// playback starts on a tap, pause when the app leaves the foreground, never play in the
// background, report error codes 2, 5, 100, 101 and 150, and log a play after 5 seconds.

import { isReportablePlayerError, PLAY_LOG_AFTER_SECONDS, PLAYER_STATE } from "@app/core";
import { type NativeMessage, parsePageMessage } from "@app/player-html";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { AppState, View } from "react-native";
import { WebView } from "react-native-webview";
import { playerSource } from "./source";

export type PlayerHandle = {
  load: (videoId: string, options: { autoplay: boolean; startSeconds?: number }) => void;
  pause: () => void;
  position: () => number;
};

type Props = {
  appId: string;
  onPlayLogged?: (videoId: string, seconds: number) => void;
  onUnplayable?: (videoId: string, code: number) => void;
};

export const PlayerWebView = forwardRef<PlayerHandle, Props>(function PlayerWebView(
  { appId, onPlayLogged, onUnplayable },
  ref,
) {
  const source = useMemo(() => playerSource(appId), [appId]);
  const webview = useRef<WebView>(null);
  const ready = useRef(false);
  const queued = useRef<NativeMessage | null>(null);
  const played = useRef({ videoId: null as string | null, ticks: 0, logged: false, time: 0 });
  const callbacks = useRef({ onPlayLogged, onUnplayable });
  callbacks.current = { onPlayLogged, onUnplayable };

  // Until the page says it's ready, keep only the latest load; play, pause and seek have
  // nothing to act on yet.
  const post = useCallback((msg: NativeMessage) => {
    if (!ready.current) {
      if (msg.type === "load") queued.current = msg;
      return;
    }
    webview.current?.postMessage(JSON.stringify(msg));
  }, []);

  useImperativeHandle(ref, () => ({
    load: (videoId, { autoplay, startSeconds }) => {
      played.current = { videoId, ticks: 0, logged: false, time: 0 };
      post({ type: "load", videoId, autoplay, startSeconds });
    },
    pause: () => post({ type: "pause" }),
    position: () => played.current.time,
  }));

  // Pause whenever the app leaves the foreground; the YouTube lane has no background play.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") post({ type: "pause" });
    });
    return () => sub.remove();
  }, [post]);

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: 16 / 9,
        minHeight: 200,
        minWidth: 200,
        backgroundColor: "#000",
      }}
    >
      <WebView
        ref={webview}
        testID="player-webview"
        source={{ html: source.html, baseUrl: source.baseUrl }}
        originWhitelist={["https://*"]}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        allowsPictureInPictureMediaPlayback={false}
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: "#000" }}
        onMessage={(e) => {
          const msg = parsePageMessage(e.nativeEvent.data);
          if (!msg) return;
          if (msg.type === "ready") {
            ready.current = true;
            const q = queued.current;
            queued.current = null;
            if (q) webview.current?.postMessage(JSON.stringify(q));
            return;
          }
          if (msg.type === "error") {
            if (msg.videoId && isReportablePlayerError(msg.code))
              callbacks.current.onUnplayable?.(msg.videoId, msg.code);
            return;
          }
          const p = played.current;
          p.time = msg.currentTime;
          if (msg.state === PLAYER_STATE.playing && msg.videoId && msg.videoId === p.videoId) {
            p.ticks += 1;
            if (!p.logged && p.ticks >= PLAY_LOG_AFTER_SECONDS) {
              p.logged = true;
              callbacks.current.onPlayLogged?.(msg.videoId, p.ticks);
            }
          }
        }}
      />
    </View>
  );
});
