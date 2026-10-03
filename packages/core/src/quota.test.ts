import { describe, expect, it } from "vitest";
import {
  isPacificDst,
  nextPacificMidnight,
  pacificDay,
  unitsForThisRun,
  unitsPerDayForRefresh,
} from "./quota";

describe("Pacific quota day", () => {
  it("follows US daylight saving time", () => {
    expect(isPacificDst(new Date("2026-03-08T09:59:59Z"))).toBe(false);
    expect(isPacificDst(new Date("2026-03-08T10:00:00Z"))).toBe(true);
    expect(isPacificDst(new Date("2026-11-01T08:59:59Z"))).toBe(true);
    expect(isPacificDst(new Date("2026-11-01T09:00:00Z"))).toBe(false);
    expect(isPacificDst(new Date("2026-07-01T00:00:00Z"))).toBe(true);
    expect(isPacificDst(new Date("2026-01-15T00:00:00Z"))).toBe(false);
  });

  it("maps instants to the Pacific calendar day", () => {
    expect(pacificDay(new Date("2026-10-03T06:59:59Z"))).toBe("2026-10-02"); // 23:59 PDT
    expect(pacificDay(new Date("2026-10-03T07:00:00Z"))).toBe("2026-10-03"); // 00:00 PDT
    expect(pacificDay(new Date("2026-01-10T07:59:59Z"))).toBe("2026-01-09"); // 23:59 PST
    expect(pacificDay(new Date("2026-01-10T08:00:00Z"))).toBe("2026-01-10");
  });

  it("finds the next reset", () => {
    expect(nextPacificMidnight(new Date("2026-10-03T12:00:00Z")).toISOString()).toBe(
      "2026-10-04T07:00:00.000Z",
    );
    expect(nextPacificMidnight(new Date("2026-01-10T12:00:00Z")).toISOString()).toBe(
      "2026-01-11T08:00:00.000Z",
    );
    // The day DST ends: midnight after is in PST.
    expect(nextPacificMidnight(new Date("2026-11-01T12:00:00Z")).toISOString()).toBe(
      "2026-11-02T08:00:00.000Z",
    );
    // The day DST starts.
    expect(nextPacificMidnight(new Date("2026-03-08T12:00:00Z")).toISOString()).toBe(
      "2026-03-09T07:00:00.000Z",
    );
  });
});

describe("budgeting", () => {
  it("spreads the remaining budget over the hours left in the Pacific day", () => {
    // 07:00Z is midnight PDT: 24 hours left.
    expect(
      unitsForThisRun({ budget: 8000, usedToday: 0, at: new Date("2026-10-03T07:00:00Z") }),
    ).toBe(333);
    // 05:30Z is 22:30 PDT: 2 hours left.
    expect(
      unitsForThisRun({ budget: 8000, usedToday: 7000, at: new Date("2026-10-04T05:30:00Z") }),
    ).toBe(500);
    expect(unitsForThisRun({ budget: 8000, usedToday: 8000, at: new Date() })).toBe(0);
    expect(
      unitsForThisRun({ budget: 10, usedToday: 9, at: new Date("2026-10-03T07:00:00Z") }),
    ).toBe(1);
  });

  it("computes the refresh cost of a catalog", () => {
    expect(unitsPerDayForRefresh(12_000_000)).toBe(8000);
    expect(unitsPerDayForRefresh(1501)).toBe(2);
  });
});
