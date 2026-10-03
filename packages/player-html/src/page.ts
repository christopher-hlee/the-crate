// Runs inside the WebView. Bundled into an HTML string by scripts/build.mjs.
// The page holds exactly one YouTube player that fills the page; nothing is drawn over it.

import { IFRAME_API_URL, PLAYER_VARS } from "@app/core/player";
import { type PageMessage, parseNativeMessage } from "./protocol";

type YTPlayer = {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
};

type Bridge = { postMessage(message: string): void };

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
    ReactNativeWebView?: Bridge;
  }
}

let player: YTPlayer | null = null;
let ready = false;
let currentVideo: string | null = null;
let pending: string | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

function send(message: PageMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function sendState(state: number): void {
  send({ type: "state", videoId: currentVideo, state, currentTime: player?.getCurrentTime() ?? 0 });
}

function handle(raw: unknown): void {
  const msg = parseNativeMessage(raw);
  if (!msg) return;
  if (!player || !ready) {
    if (msg.type === "load") pending = JSON.stringify(msg);
    return;
  }
  switch (msg.type) {
    case "load": {
      currentVideo = msg.videoId;
      const args = { videoId: msg.videoId, startSeconds: msg.startSeconds ?? 0 };
      if (msg.autoplay) player.loadVideoById(args);
      else player.cueVideoById(args);
      return;
    }
    case "play":
      player.playVideo();
      return;
    case "pause":
      player.pauseVideo();
      return;
    case "seek":
      player.seekTo(msg.seconds, true);
      return;
  }
}

function onMessage(event: Event): void {
  handle((event as MessageEvent).data);
}

// iOS delivers postMessage on window, Android on document.
window.addEventListener("message", onMessage);
document.addEventListener("message", onMessage);

window.onYouTubeIframeAPIReady = () => {
  const YT = window.YT;
  if (!YT) return;
  player = new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: { ...PLAYER_VARS },
    events: {
      onReady: () => {
        ready = true;
        send({ type: "ready" });
        if (pending) {
          const p = pending;
          pending = null;
          handle(p);
        }
      },
      onStateChange: (e: { data: number }) => {
        sendState(e.data);
        if (ticker) clearInterval(ticker);
        ticker = null;
        // While playing, report position once a second; native logs a play after 5 seconds.
        if (e.data === 1) ticker = setInterval(() => sendState(1), 1000);
      },
      onError: (e: { data: number }) =>
        send({ type: "error", videoId: currentVideo, code: e.data }),
    },
  });
};

const script = document.createElement("script");
script.src = IFRAME_API_URL;
document.head.appendChild(script);
