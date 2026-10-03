// Compliance test 7: the mobile player's WebView baseUrl is https:// plus the app ID.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appConfig } from "../config";
import { playerSource } from "./source";

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

  it("is what the WebView component actually loads", () => {
    const component = readFileSync(new URL("./PlayerWebView.tsx", import.meta.url), "utf8");
    expect(component).toMatch(
      /source=\{\{\s*html:\s*source\.html,\s*baseUrl:\s*source\.baseUrl\s*\}\}/,
    );
    expect(component).toContain("playerSource(");
    expect(component).toContain("allowsInlineMediaPlayback");
    expect(component).not.toMatch(/pointerEvents=["']none["']/);
  });

  it("ships no background audio mode", () => {
    const appConfigSource = readFileSync(new URL("../../app.config.ts", import.meta.url), "utf8");
    expect(appConfigSource).not.toMatch(/UIBackgroundModes\s*:/);
  });
});
