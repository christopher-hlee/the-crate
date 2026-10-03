// Typed client for /api/v1, shared by the web app and the mobile app. Responses are
// validated with the same zod schemas the server uses.

import { type Filters, filtersToSearchParams } from "@app/core";
import type { z } from "zod";
import {
  ApiErrorBodySchema,
  ChangelogResponseSchema,
  CountResponseSchema,
  CrateDetailSchema,
  CrateSchema,
  CratesResponseSchema,
  type CreateCrateRequestSchema,
  type CreateNoteRequestSchema,
  DailyResponseSchema,
  DeletedResponseSchema,
  type ErrorCode,
  HistoryResponseSchema,
  LinkSuggestionResponseSchema,
  MeResponseSchema,
  NoteSchema,
  NotesResponseSchema,
  OkResponseSchema,
  type PlayRequestSchema,
  PlayResponseSchema,
  RecordSchema,
  RedirectResponseSchema,
  SequenceResponseSchema,
  SharedCrateSchema,
  ShareResponseSchema,
  ShuffleResponseSchema,
  StylesResponseSchema,
  type TempoVoteRequestSchema,
  type UpdateCrateRequestSchema,
} from "./contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "network",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClientOptions = {
  /** "" for same-origin requests on the web; the API origin on mobile. */
  baseUrl: string;
  /** Mobile: the Supabase access token, sent as a Bearer token. */
  getAccessToken?: () => Promise<string | null> | string | null;
  fetch?: typeof fetch;
};

type Pairs = [string, string][];

export function encodeQuery(pairs: Pairs): string {
  if (pairs.length === 0) return "";
  return `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}

export function createApiClient(options: ApiClientOptions) {
  const doFetch =
    options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function request<S extends z.ZodType>(
    schema: S,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = options.getAccessToken ? await options.getAccessToken() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await doFetch(`${options.baseUrl}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
      });
    } catch (err) {
      throw new ApiError(0, "network", err instanceof Error ? err.message : "Network error");
    }
    const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ApiErrorBodySchema.safeParse(json);
      if (parsed.success)
        throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message);
      throw new ApiError(
        res.status,
        res.status === 429 ? "rate_limited" : "internal",
        `HTTP ${res.status}`,
      );
    }
    return schema.parse(json);
  }

  const filterPairs = (filters: Filters): Pairs => filtersToSearchParams(filters);

  return {
    shuffle(
      filters: Filters,
      exclusions: { session?: readonly string[]; seen?: readonly string[] } = {},
    ) {
      const pairs = filterPairs(filters);
      for (const k of exclusions.session ?? []) pairs.push(["session", k]);
      for (const v of exclusions.seen ?? []) pairs.push(["seen", v]);
      return request(ShuffleResponseSchema, "GET", `/shuffle${encodeQuery(pairs)}`);
    },
    record(recordKey: string) {
      return request(RecordSchema, "GET", `/records/${encodeURIComponent(recordKey)}`);
    },
    styles() {
      return request(StylesResponseSchema, "GET", "/styles");
    },
    count(filters: Filters) {
      return request(
        CountResponseSchema,
        "GET",
        `/filters/count${encodeQuery(filterPairs(filters))}`,
      );
    },
    logPlay(body: z.input<typeof PlayRequestSchema>) {
      return request(PlayResponseSchema, "POST", "/plays", body);
    },
    history(cursor?: string | null) {
      return request(
        HistoryResponseSchema,
        "GET",
        `/history${encodeQuery(cursor ? [["cursor", cursor]] : [])}`,
      );
    },
    crates() {
      return request(CratesResponseSchema, "GET", "/crates");
    },
    createCrate(body: z.input<typeof CreateCrateRequestSchema>) {
      return request(CrateSchema, "POST", "/crates", body);
    },
    crate(id: string) {
      return request(CrateDetailSchema, "GET", `/crates/${encodeURIComponent(id)}`);
    },
    updateCrate(id: string, body: z.input<typeof UpdateCrateRequestSchema>) {
      return request(CrateSchema, "PATCH", `/crates/${encodeURIComponent(id)}`, body);
    },
    deleteCrate(id: string) {
      return request(DeletedResponseSchema, "DELETE", `/crates/${encodeURIComponent(id)}`);
    },
    addItem(id: string, ref: { recordKey: string; videoId: string }) {
      return request(CrateDetailSchema, "POST", `/crates/${encodeURIComponent(id)}/items`, ref);
    },
    reorderItems(id: string, order: { recordKey: string; videoId: string }[]) {
      return request(CrateDetailSchema, "PATCH", `/crates/${encodeURIComponent(id)}/items`, {
        order,
      });
    },
    removeItem(id: string, ref: { recordKey: string; videoId: string }) {
      const q = encodeQuery([
        ["recordKey", ref.recordKey],
        ["videoId", ref.videoId],
      ]);
      return request(CrateDetailSchema, "DELETE", `/crates/${encodeURIComponent(id)}/items${q}`);
    },
    sequence(id: string, page = 0) {
      return request(
        SequenceResponseSchema,
        "GET",
        `/crates/${encodeURIComponent(id)}/sequence?page=${page}`,
      );
    },
    exportUrl(id: string, format: "csv" | "json") {
      return `${options.baseUrl}/api/v1/crates/${encodeURIComponent(id)}/export?format=${format}`;
    },
    share(id: string) {
      return request(ShareResponseSchema, "POST", `/crates/${encodeURIComponent(id)}/share`);
    },
    unshare(id: string) {
      return request(CrateSchema, "DELETE", `/crates/${encodeURIComponent(id)}/share`);
    },
    shared(shareId: string) {
      return request(SharedCrateSchema, "GET", `/shared/${encodeURIComponent(shareId)}`);
    },
    daily(page = 0) {
      return request(DailyResponseSchema, "GET", `/daily?page=${page}`);
    },
    notes(videoId: string) {
      return request(NotesResponseSchema, "GET", `/notes${encodeQuery([["videoId", videoId]])}`);
    },
    createNote(body: z.input<typeof CreateNoteRequestSchema>) {
      return request(NoteSchema, "POST", "/notes", body);
    },
    report(videoId: string, code: number) {
      return request(OkResponseSchema, "POST", `/videos/${encodeURIComponent(videoId)}/report`, {
        code,
      });
    },
    suggestLink(recordKey: string, url: string) {
      return request(
        LinkSuggestionResponseSchema,
        "POST",
        `/records/${encodeURIComponent(recordKey)}/links`,
        { url },
      );
    },
    tempoVote(body: z.input<typeof TempoVoteRequestSchema>) {
      return request(OkResponseSchema, "POST", "/tempo-votes", body);
    },
    changelog() {
      return request(ChangelogResponseSchema, "GET", "/changelog");
    },
    me() {
      return request(MeResponseSchema, "GET", "/me");
    },
    deleteAccount() {
      return request(DeletedResponseSchema, "DELETE", "/me");
    },
    checkout(interval: "month" | "year" = "month") {
      return request(RedirectResponseSchema, "POST", "/billing/checkout", { interval });
    },
    portal() {
      return request(RedirectResponseSchema, "POST", "/billing/portal");
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
