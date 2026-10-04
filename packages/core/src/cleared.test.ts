import { describe, expect, it } from "vitest";
import { MAX_CHOPS, normalizeChops, regionsFromChops } from "./chops";
import { dawFileStem, safeSegment, sidecarFor, uniqueNames } from "./daw-export";
import {
  computePeaks,
  decodeWav,
  durationSeconds,
  encodeWav,
  type PcmAudio,
  sliceAudio,
  WavError,
} from "./wav";
import { crc32, createZip, utf8 } from "./zip";

function sine(seconds: number, sampleRate = 8000, channels = 1): PcmAudio {
  const n = Math.round(seconds * sampleRate);
  return {
    sampleRate,
    channels: Array.from({ length: channels }, (_, c) =>
      Float32Array.from(
        { length: n },
        (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate + c),
      ),
    ),
  };
}

describe("wav", () => {
  it("round-trips 16- and 24-bit PCM within quantisation error", () => {
    const audio = sine(0.25, 8000, 2);
    for (const bits of [16, 24] as const) {
      const back = decodeWav(encodeWav(audio, bits));
      expect(back.sampleRate).toBe(8000);
      expect(back.channels).toHaveLength(2);
      expect(back.channels[0]).toHaveLength(2000);
      const err = Math.max(
        ...Array.from(back.channels[1] ?? [], (v, i) =>
          Math.abs(v - (audio.channels[1]?.[i] ?? 0)),
        ),
      );
      expect(err).toBeLessThan(bits === 16 ? 1e-4 : 1e-6);
    }
    expect(durationSeconds(audio)).toBeCloseTo(0.25);
  });

  it("decodes 32-bit float and extensible headers and skips unknown chunks", () => {
    const frames = 4;
    const buf = new Uint8Array(12 + 8 + 40 + 8 + 4 + 8 + frames * 4);
    const v = new DataView(buf.buffer);
    const w = (at: number, s: string) => {
      for (const [i, ch] of [...s].entries()) v.setUint8(at + i, ch.charCodeAt(0));
    };
    w(0, "RIFF");
    v.setUint32(4, buf.length - 8, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 40, true);
    v.setUint16(20, 0xfffe, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 48000, true);
    v.setUint16(34, 32, true);
    v.setUint16(44, 3, true); // subformat: IEEE float
    w(60, "LIST");
    v.setUint32(64, 4, true);
    w(72, "data");
    v.setUint32(76, frames * 4, true);
    for (const [i, s] of [0.25, -0.5, 1, 0].entries()) v.setFloat32(80 + i * 4, s, true);
    const audio = decodeWav(buf);
    expect(audio.sampleRate).toBe(48000);
    expect(Array.from(audio.channels[0] ?? [])).toEqual([0.25, -0.5, 1, 0]);
  });

  it("rejects what it can't read", () => {
    expect(() => decodeWav(new Uint8Array([1, 2, 3]))).toThrow(WavError);
  });

  it("slices by time and computes min/max peaks", () => {
    const audio = sine(1, 1000);
    const part = sliceAudio(audio, 0.25, 0.75);
    expect(part.channels[0]).toHaveLength(500);
    expect(sliceAudio(audio, 0.9, 5).channels[0]).toHaveLength(100);
    expect(sliceAudio(audio, 2, 3).channels[0]).toHaveLength(0);
    const peaks = computePeaks(audio, 10);
    expect(peaks.peaks).toHaveLength(20);
    expect(Math.max(...peaks.peaks)).toBeCloseTo(0.5, 2);
    expect(Math.min(...peaks.peaks)).toBeCloseTo(-0.5, 2);
    expect(peaks.frames).toBe(1000);
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(utf8("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes stored entries with UTF-8 names and a central directory that points at them", () => {
    const files = [
      { name: "Crate/Bessie Smith - Downhearted Blues [80 BPM].wav", data: encodeWav(sine(0.01)) },
      { name: "Crate/Café Ñandú.txt", data: utf8("hi") },
    ];
    const zip = createZip(files);
    const v = new DataView(zip.buffer);
    // End of central directory: entry count, directory size and offset.
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    let p = v.getUint32(eocd + 16, true);
    for (const f of files) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      expect(v.getUint16(p + 8, true) & 0x0800).toBe(0x0800);
      const nameLen = v.getUint16(p + 28, true);
      expect(zip.slice(p + 46, p + 46 + nameLen)).toEqual(utf8(f.name));
      const local = v.getUint32(p + 42, true);
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      expect(v.getUint32(local + 14, true)).toBe(crc32(f.data));
      const dataAt = local + 30 + v.getUint16(local + 26, true);
      expect(zip.slice(dataAt, dataAt + f.data.length)).toEqual(f.data);
      p += 46 + nameLen;
    }
    expect(utf8("é€😀")).toEqual(
      Uint8Array.from([0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]),
    );
  });
});

describe("daw export names", () => {
  it("formats Artist - Title [BPM KEY]", () => {
    expect(
      dawFileStem({
        artist: "Bessie Smith",
        title: "Downhearted Blues",
        bpm: 95.6,
        camelotKey: "8A",
      }),
    ).toBe("Bessie Smith - Downhearted Blues [96 BPM 8A]");
    expect(dawFileStem({ artist: "A", title: "B", bpm: null, camelotKey: "3B" })).toBe(
      "A - B [3B]",
    );
    expect(dawFileStem({ artist: "A", title: "B" })).toBe("A - B");
    expect(dawFileStem({ artist: "A", title: "B", bpm: 120 }, 3)).toBe("A - B [120 BPM] (chop 3)");
  });

  it("makes names safe on every filesystem", () => {
    expect(safeSegment('AC/DC: "Live" <1925>?')).toBe("AC DC Live 1925");
    expect(safeSegment("con")).toBe("_con");
    expect(safeSegment("  trailing dots...  ")).toBe("trailing dots");
    expect(safeSegment("\u0000\u0007")).toBe("Untitled");
    expect(safeSegment("x".repeat(300)).length).toBe(120);
  });

  it("de-duplicates names case-insensitively", () => {
    expect(uniqueNames(["A - B", "a - b", "C", "A - B"])).toEqual([
      "A - B",
      "a - b (2)",
      "C",
      "A - B (3)",
    ]);
  });

  it("writes the rights record into the sidecar", () => {
    const rights = {
      basis: "us_pd" as const,
      sourceUrl: "https://archive.org/details/78_x",
      licenseUrl: null,
      recordingYear: 1923,
      dateEvidence: [{ kind: "discography" as const, citation: "DAHR", url: null }],
      attribution: null,
      licenseRef: null,
      licenseExpiresAt: null,
      checkedAt: "2026-10-01T00:00:00.000Z",
    };
    const s = sidecarFor({
      file: "A - B.wav",
      track: { artist: "A", title: "B", year: 1923 },
      rights,
      now: new Date("2026-10-04T00:00:00Z"),
    });
    expect(s).toMatchObject({
      file: "A - B.wav",
      year: 1923,
      chop: null,
      rights: { basis: "us_pd", recordingYear: 1923 },
    });
    expect(s.exportedAt).toBe("2026-10-04T00:00:00.000Z");
  });
});

describe("chops", () => {
  it("normalises markers and splits regions", () => {
    expect(normalizeChops([5, 1, 1.004, -2, 12, Number.NaN, 3.3333], 10)).toEqual([1, 3.333, 5]);
    expect(regionsFromChops([5, 2], 10)).toEqual([
      { index: 1, startSeconds: 0, endSeconds: 2 },
      { index: 2, startSeconds: 2, endSeconds: 5 },
      { index: 3, startSeconds: 5, endSeconds: 10 },
    ]);
    expect(
      normalizeChops(
        Array.from({ length: 100 }, (_, i) => i + 1),
        1000,
      ),
    ).toHaveLength(MAX_CHOPS);
  });
});
