import { describe, expect, it } from "vitest";
import { discogsUrl, isRecordKey, parseRecordKey, recordKeyFor } from "./record-key";

describe("record keys", () => {
  it("uses the master when there is one", () => {
    expect(recordKeyFor(5427, 1)).toBe("m:5427");
    expect(recordKeyFor(null, 1)).toBe("r:1");
    expect(recordKeyFor(0, 9)).toBe("r:9");
  });

  it("parses and validates", () => {
    expect(parseRecordKey("m:5427")).toEqual({ kind: "master", id: 5427 });
    expect(parseRecordKey("r:1")).toEqual({ kind: "release", id: 1 });
    for (const bad of [
      "x:1",
      "m:",
      "m:0",
      "m:01",
      "r:-1",
      "r:1.5",
      "m:1 ",
      "m:12345678901234567",
    ]) {
      expect(isRecordKey(bad)).toBe(false);
      expect(parseRecordKey(bad)).toBeNull();
    }
  });

  it("links to discogs.com", () => {
    expect(discogsUrl("m:5427")).toBe("https://www.discogs.com/master/5427");
    expect(discogsUrl("r:1")).toBe("https://www.discogs.com/release/1");
    expect(() => discogsUrl("nope")).toThrow();
  });
});
