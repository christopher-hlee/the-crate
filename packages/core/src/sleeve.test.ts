import { describe, expect, it } from "vitest";
import { SLEEVE_PATTERNS, sleeveFor } from "./sleeve";

describe("sleeveFor", () => {
  it("is stable for the same record and varies across records", () => {
    const a = sleeveFor({
      label: "Tidewater",
      catno: "TW-001",
      year: 1994,
      styles: ["Deep House"],
    });
    expect(
      sleeveFor({ label: "Tidewater", catno: "TW-001", year: 1994, styles: ["Deep House"] }),
    ).toEqual(a);
    const specs = Array.from({ length: 40 }, (_, i) =>
      sleeveFor({ label: "L", catno: `C-${i}`, year: 1990 + i }),
    );
    expect(new Set(specs.map((s) => s.background)).size).toBeGreaterThan(20);
    expect(new Set(specs.map((s) => s.pattern)).size).toBeGreaterThan(3);
  });

  it("produces valid colours and bounded parameters", () => {
    const s = sleeveFor({});
    expect(s.background).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(SLEEVE_PATTERNS).toContain(s.pattern);
    expect(s.density).toBeGreaterThanOrEqual(3);
    expect(s.density).toBeLessThanOrEqual(9);
  });
});
