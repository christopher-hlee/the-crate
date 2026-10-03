import { describe, expect, it } from "vitest";
import { crateSheetCsv, crateSheetRow } from "./crate-sheet";
import { DAILY_PRESETS, dailyDig } from "./daily";

describe("crate sheets", () => {
  const row = crateSheetRow({
    artist: "Ana Solis & The Quiet Engine",
    title: 'Sol "Live", 1971',
    track: { position: "A", title: "Calle Ocho Shuffle" },
    label: "=HYPERLINK(evil)",
    catno: "SE-1",
    year: 1971,
    country: "US",
    styles: ["Boogaloo", "Latin Jazz"],
    bpm: 112.5,
    camelotKey: "8A",
    videoId: "CalleOcho_1",
    discogsUrl: "https://www.discogs.com/release/201",
    notes: [
      { atSeconds: null, body: "great horns" },
      { atSeconds: 95, body: "break at 1:35" },
    ],
  });

  it("links to YouTube at the first noted timestamp and to Discogs", () => {
    expect(row.youtubeUrl).toBe("https://www.youtube.com/watch?v=CalleOcho_1&t=95s");
    expect(row.discogsUrl).toBe("https://www.discogs.com/release/201");
    expect(row.note).toBe("great horns | break at 1:35");
  });

  it("writes RFC 4180 CSV and neutralises formulas", () => {
    const csv = crateSheetCsv([row]);
    const [header, line] = csv.split("\r\n");
    expect(header).toBe(
      "artist,title,track,label,catno,year,country,styles,bpm,camelotKey,youtubeUrl,discogsUrl,note",
    );
    expect(line).toContain('"Sol ""Live"", 1971"');
    expect(line).toContain(`"'=HYPERLINK(evil)"`);
    expect(line).toContain("Boogaloo; Latin Jazz");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("daily dig", () => {
  it("is the same all day in UTC and rotates presets", () => {
    const a = dailyDig(new Date("2026-10-03T00:00:01Z"));
    const b = dailyDig(new Date("2026-10-03T23:59:59Z"));
    expect(a).toEqual(b);
    expect(a.date).toBe("2026-10-03");
    const week = Array.from(
      { length: 7 },
      (_, i) => dailyDig(new Date(Date.UTC(2026, 9, 3 + i))).preset.name,
    );
    expect(new Set(week).size).toBe(DAILY_PRESETS.length);
  });
});
