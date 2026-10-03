import { buildPlayerHtml, playerBaseUrl } from "@app/player-html";

/**
 * What the player WebView loads: the player page as an HTML string, with `baseUrl` set to
 * `https://` plus the store app ID. That base URL becomes the Referer YouTube requires (rule 11).
 */
export function playerSource(appId: string): { html: string; baseUrl: string } {
  return { html: buildPlayerHtml(), baseUrl: playerBaseUrl(appId) };
}
