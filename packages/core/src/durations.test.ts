import { describe, expect, it } from "vitest";
import { formatDuration, parseDiscogsDuration, parseIsoDuration } from "./durations";

describe("parseDiscogsDuration", () => {
  it("parses m:ss and h:mm:ss", () => {
    expect(parseDiscogsDuration("4:45")).toBe(285);
    expect(parseDiscogsDuration("0:07")).toBe(7);
    expect(parseDiscogsDuration("1:02:03")).toBe(3723);
    expect(parseDiscogsDuration(" 12:00 ")).toBe(720);
  });

  it("rejects empty or malformed values", () => {
    expect(parseDiscogsDuration("123:45")).toBe(7425);
    for (const v of [
      null,
      undefined,
      "",
      "4.45",
      "abc",
      "4:",
      ":45",
      "1:2:3:4",
      "1234:00",
      "1:234",
      "1::2",
      "4:45a",
    ]) {
      expect(parseDiscogsDuration(v)).toBeNull();
    }
  });
});

describe("parseIsoDuration", () => {
  it("parses YouTube durations", () => {
    expect(parseIsoDuration("PT4M45S")).toBe(285);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1H")).toBe(3600);
    expect(parseIsoDuration("P1DT1S")).toBe(86401);
    expect(parseIsoDuration("P0D")).toBe(0);
  });

  it("rejects malformed values", () => {
    for (const v of [null, "", "P", "PT", "4:45", "PT4X"]) expect(parseIsoDuration(v)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats for display", () => {
    expect(formatDuration(285)).toBe("4:45");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-3)).toBe("0:00");
  });
});
