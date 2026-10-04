import { describe, expect, it } from "vitest";
import {
  checkRights,
  classifyLicenseUrl,
  effectivePdCutoff,
  type RightsRecord,
  usRecordingPdCutoffYear,
} from "./rights";

const at = (iso: string) => new Date(iso);

describe("usRecordingPdCutoffYear", () => {
  it("follows the Music Modernization Act terms", () => {
    expect(usRecordingPdCutoffYear(at("2021-12-31T12:00:00Z"))).toBeNull();
    expect(usRecordingPdCutoffYear(at("2022-01-01T00:00:00Z"))).toBe(1922);
    expect(usRecordingPdCutoffYear(at("2023-06-01T00:00:00Z"))).toBe(1922);
    expect(usRecordingPdCutoffYear(at("2024-01-01T00:00:00Z"))).toBe(1923);
    expect(usRecordingPdCutoffYear(at("2026-10-04T00:00:00Z"))).toBe(1925);
    expect(usRecordingPdCutoffYear(at("2027-01-01T00:00:00Z"))).toBe(1926);
    expect(usRecordingPdCutoffYear(at("2047-12-31T00:00:00Z"))).toBe(1946);
    // 1947–1956 recordings get 110 years.
    expect(usRecordingPdCutoffYear(at("2050-01-01T00:00:00Z"))).toBe(1946);
    expect(usRecordingPdCutoffYear(at("2058-01-01T00:00:00Z"))).toBe(1947);
    expect(usRecordingPdCutoffYear(at("2067-01-01T00:00:00Z"))).toBe(1956);
    // Everything fixed before 15 February 1972 is free from 15 February 2067.
    expect(usRecordingPdCutoffYear(at("2067-02-15T00:00:00Z"))).toBe(1971);
    expect(usRecordingPdCutoffYear(at("2068-01-01T00:00:00Z"))).toBe(1972);
  });

  it("never lets a stored cutoff run ahead of the law", () => {
    expect(effectivePdCutoff(1930, at("2026-03-01T00:00:00Z"))).toBe(1925);
    expect(effectivePdCutoff(1924, at("2026-03-01T00:00:00Z"))).toBe(1924);
    expect(effectivePdCutoff(null, at("2026-03-01T00:00:00Z"))).toBeNull();
  });
});

describe("classifyLicenseUrl", () => {
  it("recognises CC0, CC BY and CC BY-SA in any version, port or deed form", () => {
    expect(classifyLicenseUrl("https://creativecommons.org/publicdomain/zero/1.0/")).toEqual({
      basis: "cc0",
    });
    expect(classifyLicenseUrl("http://creativecommons.org/licenses/by/3.0/us/")).toEqual({
      basis: "cc_by",
    });
    expect(classifyLicenseUrl("https://creativecommons.org/licenses/by/4.0/legalcode")).toEqual({
      basis: "cc_by",
    });
    expect(classifyLicenseUrl("https://creativecommons.org/licenses/by-sa/2.5/deed.de")).toEqual({
      basis: "cc_by_sa",
    });
    expect(classifyLicenseUrl("https://www.creativecommons.org/licenses/by-sa/4.0")).toEqual({
      basis: "cc_by_sa",
    });
  });

  it("rejects NC, ND, sampling and the Public Domain Mark", () => {
    for (const url of [
      "https://creativecommons.org/licenses/by-nc/4.0/",
      "https://creativecommons.org/licenses/by-nd/3.0/",
      "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      "https://creativecommons.org/licenses/by-nc-nd/2.0/",
      "https://creativecommons.org/licenses/sampling+/1.0/",
    ]) {
      expect(classifyLicenseUrl(url)).toMatchObject({ rejected: expect.any(String) });
    }
    expect(classifyLicenseUrl("https://creativecommons.org/publicdomain/mark/1.0/")).toMatchObject({
      rejected: expect.stringMatching(/date evidence/),
    });
    expect(classifyLicenseUrl("https://example.com/licence")).toMatchObject({
      rejected: expect.any(String),
    });
    expect(classifyLicenseUrl("not a url")).toMatchObject({ rejected: expect.any(String) });
  });
});

describe("checkRights", () => {
  const now = at("2026-10-04T00:00:00Z");
  const base: RightsRecord = {
    basis: "us_pd",
    sourceUrl: "https://archive.org/details/78_example",
    licenseUrl: null,
    recordingYear: 1924,
    dateEvidence: [
      {
        kind: "discography",
        citation: "DAHR matrix B-29999, recorded 1924-03-11",
        url: "https://adp.library.ucsb.edu/",
      },
    ],
    attribution: null,
    licenseRef: null,
    licenseExpiresAt: null,
  };
  const ctx = { usPdCutoffYear: 1925, now };

  it("accepts a dated US recording from the cutoff year or earlier", () => {
    expect(checkRights(base, ctx)).toEqual({ ok: true, problems: [] });
    expect(checkRights({ ...base, recordingYear: 1925 }, ctx).ok).toBe(true);
  });

  it("holds US recordings after the cutoff or without date evidence", () => {
    expect(checkRights({ ...base, recordingYear: 1926 }, ctx)).toMatchObject({
      ok: false,
      held: true,
    });
    expect(checkRights({ ...base, recordingYear: null }, ctx).ok).toBe(false);
    expect(checkRights({ ...base, dateEvidence: [] }, ctx).problems).toContain(
      "A public-domain recording needs date evidence.",
    );
    expect(checkRights(base, { ...ctx, usPdCutoffYear: null }).ok).toBe(false);
  });

  it("needs a matching licence URL, and attribution for BY and BY-SA", () => {
    const cc = { ...base, recordingYear: null, dateEvidence: [] };
    expect(
      checkRights(
        { ...cc, basis: "cc0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
        ctx,
      ).ok,
    ).toBe(true);
    expect(
      checkRights(
        { ...cc, basis: "cc_by", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
        ctx,
      ).problems,
    ).toContain("CC BY and CC BY-SA need an attribution line.");
    expect(
      checkRights(
        {
          ...cc,
          basis: "cc_by",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          attribution: "Jane Doe, CC BY 4.0",
        },
        ctx,
      ).ok,
    ).toBe(true);
    expect(
      checkRights(
        {
          ...cc,
          basis: "cc_by",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
          attribution: "x",
        },
        ctx,
      ).ok,
    ).toBe(false);
    expect(checkRights({ ...cc, basis: "cc0", licenseUrl: null }, ctx).ok).toBe(false);
  });

  it("never accepts NC or ND, whatever the basis says", () => {
    const r = checkRights(
      { ...base, licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/" },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/NC/);
  });

  it("needs a reference and an unexpired term for a signed licence", () => {
    const signed = {
      ...base,
      basis: "signed_license" as const,
      recordingYear: null,
      dateEvidence: [],
    };
    expect(checkRights(signed, ctx).ok).toBe(false);
    expect(checkRights({ ...signed, licenseRef: "LIC-2026-004" }, ctx).ok).toBe(true);
    expect(
      checkRights({ ...signed, licenseRef: "LIC-2026-004", licenseExpiresAt: "2026-01-01" }, ctx)
        .ok,
    ).toBe(false);
  });
});
