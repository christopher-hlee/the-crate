import { describe, expect, it } from "vitest";
import { buildPlayerHtml, playerBaseUrl } from "./html";
import { parseNativeMessage, parsePageMessage } from "./protocol";

describe("player page", () => {
  const html = buildPlayerHtml();

  it("loads the IFrame API once and holds one player element", () => {
    expect(html.match(/iframe_api/g)?.length).toBe(1);
    expect(html.match(/id="player"/g)?.length).toBe(1);
    expect(html).not.toMatch(/inert|pointer-events/);
  });

  it("uses only documented player parameters", () => {
    expect(html).toContain("playsinline");
    expect(html).toContain("controls");
    expect(html).toContain("rel");
    expect(html).not.toMatch(/autoplay:\s*1|mute:\s*1|modestbranding|showinfo/);
  });

  it("never closes its own script tag early", () => {
    expect(html.match(/<\/script>/g)?.length).toBe(1);
  });

  it("contains no Google API key", () => {
    expect(html).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
  });
});

describe("baseUrl (compliance test 7)", () => {
  it("is https:// plus the lowercase app ID", () => {
    expect(playerBaseUrl("com.example.cratedig")).toBe("https://com.example.cratedig");
    expect(playerBaseUrl("Com.Example.CrateDig")).toBe("https://com.example.cratedig");
    expect(() => playerBaseUrl("not an id")).toThrow();
    expect(() => playerBaseUrl("https://evil.example")).toThrow();
  });
});

describe("bridge messages", () => {
  it("accepts well-formed messages both ways", () => {
    expect(parseNativeMessage({ type: "load", videoId: "GlassHarb01", autoplay: false })).toEqual({
      type: "load",
      videoId: "GlassHarb01",
      autoplay: false,
    });
    expect(parseNativeMessage('{"type":"seek","seconds":30}')).toEqual({
      type: "seek",
      seconds: 30,
    });
    expect(
      parsePageMessage({ type: "state", videoId: null, state: 1, currentTime: 3.5 }),
    ).toMatchObject({ state: 1 });
    expect(parsePageMessage('{"type":"error","videoId":"GlassHarb01","code":150}')).toMatchObject({
      code: 150,
    });
  });

  it("rejects anything else", () => {
    expect(parseNativeMessage({ type: "load", videoId: "bad", autoplay: true })).toBeNull();
    expect(parseNativeMessage({ type: "eval", code: "alert(1)" })).toBeNull();
    expect(parseNativeMessage("not json")).toBeNull();
    expect(parsePageMessage({ type: "state" })).toBeNull();
  });
});
