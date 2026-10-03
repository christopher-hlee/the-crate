import { PAGE_SCRIPT } from "../generated/page-script";

/**
 * The player page for react-native-webview: one YouTube player filling the page and nothing
 * else on it. Load it as an HTML string with `baseUrl` set to playerBaseUrl(appId) so YouTube
 * receives the required Referer.
 */
export function buildPlayerHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}#player{width:100%;height:100%}</style>
</head>
<body>
<div id="player"></div>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}

const APP_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

/** `https://` plus the store app ID in lowercase reverse-DNS: the WebView's baseUrl (rule 11). */
export function playerBaseUrl(appId: string): string {
  const id = appId.trim().toLowerCase();
  if (!APP_ID.test(id)) throw new Error(`Not a reverse-DNS app ID: ${appId}`);
  return `https://${id}`;
}
