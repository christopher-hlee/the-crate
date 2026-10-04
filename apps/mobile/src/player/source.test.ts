// Compliance test 7: the mobile player's WebView baseUrl is https:// plus the app ID.
// Also: no background playback for the YouTube lane, in any build.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildConfig } from "../../app.config";
import { appConfig } from "../config";
import { playerSource } from "./source";

type PluginEntry = string | [string, Record<string, unknown>];

describe("player WebView source", () => {
  it("uses https:// plus the app ID as the baseUrl on both platforms", () => {
    for (const platform of ["ios", "android"]) {
      const cfg = appConfig(
        { appIdIos: "com.example.cratedig", appIdAndroid: "com.example.cratedig.android" },
        platform,
      );
      expect(playerSource(cfg.appId).baseUrl).toBe(`https://${cfg.appId}`);
    }
    expect(playerSource(appConfig(undefined, "ios").appId).baseUrl).toBe(
      "https://com.example.cratedig",
    );
  });

  it("is what the WebView component actually loads, and pauses outside the foreground", () => {
    const component = readFileSync(new URL("./PlayerWebView.tsx", import.meta.url), "utf8");
    expect(component).toMatch(
      /source=\{\{\s*html:\s*source\.html,\s*baseUrl:\s*source\.baseUrl\s*\}\}/,
    );
    expect(component).toContain("playerSource(");
    expect(component).toContain("allowsInlineMediaPlayback");
    expect(component).not.toMatch(/pointerEvents=["']none["']/);
    expect(component).toMatch(
      /AppState\.addEventListener\("change"[\s\S]*?!== "active"\) post\(\{ type: "pause" \}\)/,
    );
  });

  it("ships no background audio mode unless the archive is built in", () => {
    const audioPlugin = (env: Record<string, string>) =>
      (buildConfig(env).plugins as PluginEntry[]).find(
        (p) => Array.isArray(p) && p[0] === "expo-audio",
      ) as [string, Record<string, unknown>];
    const plain = buildConfig({});
    expect(plain.ios?.infoPlist?.UIBackgroundModes).toBeUndefined();
    expect(audioPlugin({})[1]).toMatchObject({
      enableBackgroundPlayback: false,
      recordAudioAndroid: false,
      microphonePermission: false,
    });
    expect(plain.android?.blockedPermissions).toContain(
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    );
    expect(plain.android?.blockedPermissions).toContain("android.permission.RECORD_AUDIO");
    expect(plain.extra?.archive).toBe(false);

    const archive = buildConfig({ FEATURE_CLEARED_LANE: "1" });
    expect(audioPlugin({ FEATURE_CLEARED_LANE: "1" })[1]).toMatchObject({
      enableBackgroundPlayback: true,
      recordAudioAndroid: false,
    });
    expect(archive.android?.blockedPermissions).toContain("android.permission.RECORD_AUDIO");
    expect(archive.extra?.archive).toBe(true);
  });
});
