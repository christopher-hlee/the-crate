import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL_PLACEHOLDER } from "./config";
import {
  COMMENT_BLOCKED_TERM_MESSAGE,
  COMMENT_LINK_MESSAGE,
  commentProblem,
  containsLink,
  DISPLAY_NAME_BLOCKED_TERM_MESSAGE,
  DISPLAY_NAME_LINK_MESSAGE,
  displayNameContentProblem,
  hasBlockedTerm,
  moderationText,
  NO_BLOCKED_TERMS,
  parseBlockedTerms,
  supportContact,
} from "./moderation";

// Placeholder words only: the real list is operator-supplied (COMMENT_BLOCKED_TERMS) and never
// lives in the repository.

describe("moderationText", () => {
  it("folds compatibility forms, drops invisible format characters and lowercases", () => {
    expect(moderationText("ＳＰＯＲＫ")).toBe("spork");
    expect(moderationText("Sp​ork")).toBe("spork"); // a zero-width space inside
    expect(moderationText("ＷＷＷ．")).toBe("www.");
  });
});

describe("containsLink", () => {
  it("catches URLs with a scheme and www. addresses", () => {
    for (const text of [
      "Full rip at https://example.org/x",
      "HTTP://EXAMPLE.ORG",
      "ftp://files.example",
      "go to www.example",
      "WWW.Example.net",
      "ｗｗｗ．example", // fullwidth www.
    ]) {
      expect(containsLink(text), text).toBe(true);
    }
  });

  it("catches bare domains, with or without a path", () => {
    for (const text of [
      "example.com",
      "cheap pressings at shop.example.co.uk/deals",
      "EXAMPLE.COM",
      "bit.ly/abc",
      "see records.io.",
      "(mirror: dl.example.ru)",
      "youtu.be/abcdefghijk",
      "t.me/somechannel",
      "write to someone@example.com",
      "bücher.de",
    ]) {
      expect(containsLink(text), text).toBe(true);
    }
  });

  it("leaves ordinary comment text alone", () => {
    for (const text of [
      "Break at 1:12, sampled everywhere.",
      "Vol.2 is better",
      "e.g. the B-side",
      "a.k.a. the blue label",
      "St. Louis pressing, 12.5 cm",
      "Feat.De La Soul on the remix", // a missing space before a capitalized word
      "Great track.It slaps",
      "track.live version is better", // word-like endings count only with a path
      "U.K. first press, U.S.A. reissue",
      "awww... wwww",
      "readme.md and mix.wav",
    ]) {
      expect(containsLink(text), text).toBe(false);
    }
  });
});

describe("blocked terms", () => {
  const terms = parseBlockedTerms(" Spork, foo  BAR ,, spork,a+b ");

  it("parses a comma-separated list, normalized and without duplicates", () => {
    expect(terms.terms).toEqual(["spork", "foo bar", "a+b"]);
    expect(parseBlockedTerms(undefined)).toEqual(NO_BLOCKED_TERMS);
    expect(parseBlockedTerms(" , ")).toEqual(NO_BLOCKED_TERMS);
  });

  it("matches whole words and phrases, ignoring case and width", () => {
    for (const text of [
      "spork",
      "What a SPORK!",
      "(spork)",
      "ｓｐｏｒｋ here",
      "sp​ork", // a zero-width space inside
      "a foo bar b",
      "FOO\n  bar",
      "x a+b y",
    ]) {
      expect(hasBlockedTerm(text, terms), text).toBe(true);
    }
  });

  it("doesn't match inside other words", () => {
    for (const text of ["sporks", "Sporkful", "foobar", "foo-ish bar", "aa+bb", "fine words"]) {
      expect(hasBlockedTerm(text, terms), text).toBe(false);
    }
    expect(hasBlockedTerm("spork", NO_BLOCKED_TERMS)).toBe(false);
  });
});

describe("commentProblem", () => {
  const terms = parseBlockedTerms("spork");

  it("explains what's wrong without repeating the word", () => {
    expect(commentProblem("Heavy drums at 0:40", terms)).toBeNull();
    expect(commentProblem("rip at example.com", terms)).toBe(COMMENT_LINK_MESSAGE);
    expect(commentProblem("total spork", terms)).toBe(COMMENT_BLOCKED_TERM_MESSAGE);
    expect(COMMENT_BLOCKED_TERM_MESSAGE).not.toContain("spork");
    expect(commentProblem("total spork")).toBeNull();
  });
});

describe("supportContact", () => {
  it("uses the configured address, or a marked placeholder", () => {
    expect(supportContact(" help@crate.example ")).toEqual({
      email: "help@crate.example",
      placeholder: false,
    });
    expect(supportContact(undefined)).toEqual({
      email: SUPPORT_EMAIL_PLACEHOLDER,
      placeholder: true,
    });
    expect(supportContact("not an email")).toMatchObject({ placeholder: true });
  });
});

describe("displayNameContentProblem", () => {
  const blocked = parseBlockedTerms("zorblat, frim fram");

  it("refuses names that carry a link or a blocked term", () => {
    expect(displayNameContentProblem("visit spamsite.com", blocked)).toBe(
      DISPLAY_NAME_LINK_MESSAGE,
    );
    expect(displayNameContentProblem("Zorblat crew", blocked)).toBe(
      DISPLAY_NAME_BLOCKED_TERM_MESSAGE,
    );
    expect(displayNameContentProblem("the frim fram", blocked)).toBe(
      DISPLAY_NAME_BLOCKED_TERM_MESSAGE,
    );
  });

  it("lets ordinary names through, and everything when no list is set", () => {
    expect(displayNameContentProblem("D.J. Kool Herc", blocked)).toBeNull();
    expect(displayNameContentProblem("Zorblatty", blocked)).toBeNull();
    expect(displayNameContentProblem("Zorblat crew")).toBeNull();
  });
});
