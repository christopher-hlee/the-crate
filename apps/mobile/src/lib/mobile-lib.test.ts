import { SHUFFLE_EXCLUDE_MAX } from "@app/core";
import { describe, expect, it } from "vitest";
import { cappedList } from "./exclusions";
import { isNextSwipe } from "./gestures";

describe("cappedList", () => {
  it("keeps the newest entries, without duplicates, up to the cap", () => {
    const list = cappedList(3);
    for (const v of ["a", "b", "c", "a", "d"]) list.add(v);
    expect(list.get()).toEqual(["c", "a", "d"]);
    list.clear();
    expect(list.get()).toEqual([]);
  });

  it("defaults to the shuffle endpoint's limit", () => {
    const list = cappedList();
    for (let i = 0; i < SHUFFLE_EXCLUDE_MAX + 50; i++) list.add(String(i));
    expect(list.get()).toHaveLength(SHUFFLE_EXCLUDE_MAX);
  });
});

describe("isNextSwipe", () => {
  const pan = (translationX: number, translationY: number, velocityX = 0, velocityY = 0) => ({
    translationX,
    translationY,
    velocityX,
    velocityY,
  });

  it("takes a swipe left or up", () => {
    expect(isNextSwipe(pan(-80, 5))).toBe(true);
    expect(isNextSwipe(pan(4, -90))).toBe(true);
    expect(isNextSwipe(pan(-20, 0, -900))).toBe(true);
    expect(isNextSwipe(pan(0, -20, 0, -900))).toBe(true);
  });

  it("ignores swipes right or down and small moves", () => {
    expect(isNextSwipe(pan(80, 0))).toBe(false);
    expect(isNextSwipe(pan(0, 90))).toBe(false);
    expect(isNextSwipe(pan(-20, 10))).toBe(false);
    expect(isNextSwipe(pan(20, 0, -900))).toBe(false);
  });
});
