import type { Page } from "@playwright/test";

// A stand-in for https://www.youtube.com/iframe_api. It builds a real iframe pointing at
// youtube.com/embed (served offline by the route below), records every API call on
// window.__yt, and lets tests trigger player events.

const STUB = `
(function () {
  var calls = [];
  var players = [];
  window.__yt = { calls: calls, players: players, scripts: 0 };
  function Player(el, opts) {
    var iframe = document.createElement('iframe');
    var id = opts.videoId || 'none';
    iframe.src = 'https://www.youtube.com/embed/' + id + '?enablejsapi=1&origin=' + encodeURIComponent(opts.playerVars.origin || '');
    iframe.width = opts.width; iframe.height = opts.height;
    iframe.setAttribute('allow', 'autoplay; encrypted-media');
    iframe.title = 'YouTube video player';
    el.replaceWith(iframe);
    var self = this;
    this.iframe = iframe; this.opts = opts; this.state = -1; this.time = 0;
    calls.push({ fn: 'new', playerVars: opts.playerVars });
    players.push(this);
    setTimeout(function () { opts.events && opts.events.onReady && opts.events.onReady(); }, 10);
    this._set = function (s) { self.state = s; opts.events.onStateChange && opts.events.onStateChange({ data: s }); };
  }
  Player.prototype.loadVideoById = function (o) {
    calls.push({ fn: 'loadVideoById', videoId: o.videoId, startSeconds: o.startSeconds });
    this.iframe.src = 'https://www.youtube.com/embed/' + o.videoId + '?autoplay=1';
    var self = this; setTimeout(function () { self._set(1); }, 20);
  };
  Player.prototype.cueVideoById = function (o) {
    calls.push({ fn: 'cueVideoById', videoId: o.videoId, startSeconds: o.startSeconds });
    this.iframe.src = 'https://www.youtube.com/embed/' + o.videoId;
    var self = this; setTimeout(function () { self._set(5); }, 20);
  };
  Player.prototype.playVideo = function () { calls.push({ fn: 'playVideo' }); this._set(1); };
  Player.prototype.pauseVideo = function () { calls.push({ fn: 'pauseVideo' }); this._set(2); };
  Player.prototype.getCurrentTime = function () { return this.time; };
  Player.prototype.destroy = function () { calls.push({ fn: 'destroy' }); };
  Player.prototype.__error = function (code) { this.opts.events.onError && this.opts.events.onError({ data: code }); };
  window.YT = { Player: Player, PlayerState: { PLAYING: 1, PAUSED: 2, CUED: 5 } };
  setTimeout(function () { window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 0);
})();
`;

export async function stubYouTube(page: Page): Promise<{ apiLoads: () => number }> {
  let loads = 0;
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    loads++;
    return route.fulfill({ contentType: "text/javascript", body: STUB });
  });
  await page.route("https://www.youtube.com/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>stub player</title><body style='margin:0;background:#000'></body>",
    }),
  );
  await page.route("https://i.ytimg.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  return { apiLoads: () => loads };
}

export type YtCall = {
  fn: string;
  videoId?: string;
  startSeconds?: number;
  playerVars?: Record<string, unknown>;
};

export async function ytCalls(page: Page): Promise<YtCall[]> {
  // Empty until the stubbed iframe_api script has run, so polls wait instead of throwing.
  return page.evaluate(
    () => (window as unknown as { __yt?: { calls: YtCall[] } }).__yt?.calls ?? [],
  );
}
