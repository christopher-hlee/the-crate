import { describe, expect, it } from "vitest";
import { buildCountQuery, buildPickQuery, buildSeededQuery, filterClauses } from "./shuffle";
import { Params } from "./sql";

describe("filterClauses", () => {
  it("adds nothing for an empty filter", () => {
    expect(filterClauses({}, new Params())).toEqual([]);
  });

  it("parameterises every user value", () => {
    const p = new Params();
    const clauses = filterClauses(
      {
        styles: ["House'; drop table history; --"],
        yearFrom: 1990,
        yearTo: 1999,
        countries: ["UK"],
        formats: ["Vinyl"],
        bpmFrom: 120,
        bpmTo: 125,
        halfDouble: true,
        key: "8A",
        compatibleKeys: true,
        maxViews: 1000,
        labelIds: [5],
        artistIds: [7],
        deepCutMin: 0.5,
        formatDescriptions: ["Promo"],
      },
      p,
    );
    const sql = clauses.join(" ");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("1990");
    expect(p.values).toContainEqual(["House'; drop table history; --"]);
    expect(p.values).toContainEqual(["8A", "7A", "9A", "8B"]);
    expect(sql).toMatch(/\(rv\.bpm between \$\d+::real and \$\d+::real or rv\.bpm between/);
    expect(p.values).toEqual(expect.arrayContaining([60, 62.5, 120, 125, 240, 250]));
  });

  it("uses the single key without compatible keys", () => {
    const p = new Params();
    filterClauses({ key: "8A" }, p);
    expect(p.values).toEqual([["8A"]]);
  });
});

describe("query builders", () => {
  it("builds the unseeded pick with exclusions in order", () => {
    const q = buildPickQuery(
      { styles: ["House"] },
      {
        r: 123.9,
        sessionRecordKeys: ["m:1"],
        clientSeenIds: ["abcdefghijk"],
        userId: "00000000-0000-0000-0000-000000000001",
        viewerCountry: "DE",
      },
    );
    expect(q.text).toContain("where rv.playable");
    expect(q.text).toContain("order by rv.rand_key\nlimit 1");
    expect(q.values).toEqual([
      ["House"],
      123,
      ["m:1"],
      ["abcdefghijk"],
      "00000000-0000-0000-0000-000000000001",
      "DE",
    ]);
  });

  it("skips the region clause when the country is unknown or malformed", () => {
    expect(buildPickQuery({}, { r: 0, viewerCountry: null }).text).not.toContain("region");
    expect(buildPickQuery({}, { r: 0, viewerCountry: "XX1" }).text).not.toContain("region");
  });

  it("caps counts and orders seeded pages by a seeded hash", () => {
    expect(buildCountQuery({}, { cap: 10 }).values).toEqual([11]);
    const s = buildSeededQuery({ genres: ["Jazz"] }, { seed: 99, limit: 50, offset: 100 });
    expect(s.text).toContain("hashtextextended(rv.record_key || ':' || rv.video_id, $2::bigint)");
    expect(s.values).toEqual([["Jazz"], 99, 50, 100]);
  });
});
