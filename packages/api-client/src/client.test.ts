import { describe, expect, it } from "vitest";
import { ApiError, createApiClient, encodeQuery } from "./client";

const pick = {
  recordKey: "m:7001",
  videoId: "GlassHarb01",
  releaseId: 101,
  track: { position: "A1", title: "Glass Harbour" },
  record: {
    title: "Glass Harbour",
    artist: "Marlo Venn",
    label: "Tidewater Sound",
    catno: "TW-001",
    year: 1993,
    country: "UK",
    styles: ["Deep House"],
    discogsUrl: "https://www.discogs.com/master/7001",
  },
  tempo: null,
  thumbnailUrl: null,
};

function fakeFetch(
  status: number,
  body: unknown,
  seen: { url: string; init?: RequestInit }[] = [],
) {
  return (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("api client", () => {
  it("encodes filters and exclusions as repeated query params", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = createApiClient({
      baseUrl: "https://api.test",
      fetch: fakeFetch(200, { pick, via: "seek" }, seen),
    });
    const res = await api.shuffle(
      { styles: ["Deep House", "Acid"], yearFrom: 1990 },
      { session: ["m:1"], seen: ["abcdefghijk"] },
    );
    expect(res.pick?.videoId).toBe("GlassHarb01");
    expect(seen[0]?.url).toBe(
      "https://api.test/api/v1/shuffle?style=Acid&style=Deep%20House&year_from=1990&session=m%3A1&seen=abcdefghijk",
    );
  });

  it("sends the bearer token when one is available", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = createApiClient({
      baseUrl: "",
      getAccessToken: async () => "tok",
      fetch: fakeFetch(200, { logged: true }, seen),
    });
    await api.logPlay({ recordKey: "m:1", videoId: "abcdefghijk", seconds: 5 });
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(seen[0]?.init?.method).toBe("POST");
  });

  it("turns error bodies into ApiError", async () => {
    const api = createApiClient({
      baseUrl: "",
      fetch: fakeFetch(403, {
        error: { code: "pro_required", message: "Tempo filters are a Pro tool." },
      }),
    });
    await expect(api.shuffle({ bpmFrom: 120 })).rejects.toMatchObject({
      status: 403,
      code: "pro_required",
    });
  });

  it("rejects responses that don't match the contract", async () => {
    const api = createApiClient({
      baseUrl: "",
      fetch: fakeFetch(200, { pick: { videoId: "x" }, via: "seek" }),
    });
    await expect(api.shuffle({})).rejects.not.toBeInstanceOf(ApiError);
  });

  it("encodes query strings", () => {
    expect(encodeQuery([])).toBe("");
    expect(encodeQuery([["a b", "c&d"]])).toBe("?a%20b=c%26d");
  });
});
