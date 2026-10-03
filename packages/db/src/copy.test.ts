import { describe, expect, it } from "vitest";
import { copyField, copyRow } from "./copy";

describe("COPY text format", () => {
  it("encodes scalars and nulls", () => {
    expect(copyField(null)).toBe("\\N");
    expect(copyField(undefined)).toBe("\\N");
    expect(copyField(true)).toBe("t");
    expect(copyField(false)).toBe("f");
    expect(copyField(42)).toBe("42");
    expect(copyField(1.5)).toBe("1.5");
    expect(copyField(Number.NaN)).toBe("\\N");
  });

  it("escapes backslashes, tabs and newlines in text", () => {
    expect(copyField("a\tb\nc\\d\re")).toBe("a\\tb\\nc\\\\d\\re");
  });

  it("writes array literals with quoted elements", () => {
    expect(copyField([])).toBe("{}");
    expect(copyField(["House", 'Say "Hi"', "back\\slash", "a,b"])).toBe(
      '{"House","Say \\\\"Hi\\\\"","back\\\\\\\\slash","a,b"}',
    );
    expect(copyField([1, 2])).toBe("{1,2}");
  });

  it("serialises JSON", () => {
    expect(copyField({ json: { a: "x\ty" } })).toBe('{"a":"x\\\\ty"}');
  });

  it("joins a row with tabs and ends it with a newline", () => {
    expect(copyRow(["a", null, 1])).toBe("a\t\\N\t1\n");
  });
});
