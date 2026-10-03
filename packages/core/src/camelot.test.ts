import { describe, expect, it } from "vitest";
import {
  bpmRanges,
  camelotFromPitchClass,
  camelotToKeyName,
  compatibleKeys,
  pitchClassOf,
  toCamelot,
} from "./camelot";

describe("Camelot conversion", () => {
  it("maps the wheel's anchor keys", () => {
    expect(camelotFromPitchClass(0, "major")).toBe("8B"); // C
    expect(camelotFromPitchClass(9, "minor")).toBe("8A"); // Am
    expect(camelotFromPitchClass(11, "major")).toBe("1B"); // B
    expect(camelotFromPitchClass(8, "minor")).toBe("1A"); // G#m
    expect(camelotFromPitchClass(4, "major")).toBe("12B"); // E
    expect(camelotFromPitchClass(1, "minor")).toBe("12A"); // C#m
    expect(camelotFromPitchClass(5, "major")).toBe("7B"); // F
    expect(camelotFromPitchClass(2, "minor")).toBe("7A"); // Dm
  });

  it("round-trips every code", () => {
    for (let n = 1; n <= 12; n++) {
      for (const letter of ["A", "B"] as const) {
        const key = `${n}${letter}` as const;
        const { pitchClass, mode } = pitchClassOf(key);
        expect(camelotFromPitchClass(pitchClass, mode)).toBe(key);
      }
    }
  });

  it("parses key names in common spellings", () => {
    expect(toCamelot("Am")).toBe("8A");
    expect(toCamelot("A minor")).toBe("8A");
    expect(toCamelot("C")).toBe("8B");
    expect(toCamelot("C major")).toBe("8B");
    expect(toCamelot("C♯m")).toBe("12A");
    expect(toCamelot("Db major")).toBe("3B");
    expect(toCamelot("D♭")).toBe("3B");
    expect(toCamelot("bbm")).toBe("3A");
    expect(toCamelot("e minor")).toBe("9A");
    expect(toCamelot("A Minor")).toBe("8A");
    expect(toCamelot("F# Major")).toBe("2B");
    expect(toCamelot("8a")).toBe("8A");
    expect(toCamelot("12B")).toBe("12B");
    for (const bad of [null, "", "H", "13A", "0B", "C##", "A mixolydian"])
      expect(toCamelot(bad)).toBeNull();
  });

  it("names keys for display", () => {
    expect(camelotToKeyName("8A")).toBe("A minor");
    expect(camelotToKeyName("3B")).toBe("Db major");
    expect(camelotToKeyName("12A")).toBe("C# minor");
  });
});

describe("compatibleKeys", () => {
  it("returns the key, its neighbours and its relative", () => {
    expect(compatibleKeys("8A")).toEqual(["8A", "7A", "9A", "8B"]);
    expect(compatibleKeys("1B")).toEqual(["1B", "12B", "2B", "1A"]);
    expect(compatibleKeys("12A")).toEqual(["12A", "11A", "1A", "12B"]);
  });
});

describe("bpmRanges", () => {
  it("returns the range alone without half/double time", () => {
    expect(bpmRanges(120, 130, false)).toEqual([[120, 130]]);
    expect(bpmRanges(130, 120, false)).toEqual([[120, 130]]);
  });

  it("adds halved and doubled ranges and merges overlaps", () => {
    expect(bpmRanges(85, 90, true)).toEqual([
      [42.5, 45],
      [85, 90],
      [170, 180],
    ]);
    expect(bpmRanges(60, 130, true)).toEqual([[30, 260]]);
  });
});
