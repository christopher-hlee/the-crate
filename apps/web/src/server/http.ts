import "server-only";
import type { ErrorCode } from "@app/api-client";
import * as Sentry from "@sentry/nextjs";
import { ZodError, type z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
export const unauthorized = () => new HttpError(401, "unauthorized", "Sign in to do that.");
export const proRequired = (what: string, plural = false) =>
  new HttpError(403, "pro_required", `${what} ${plural ? "are Pro tools" : "is a Pro tool"}.`);
export const notFound = (what = "That") => new HttpError(404, "not_found", `${what} wasn't found.`);
export const PRO_FILTERS_MESSAGE =
  'Keyword, topic-channel, deep-cut, format-note and "more from" filters';
export const limitReached = (message: string) => new HttpError(403, "limit_reached", message);

/** "yearFrom: Invalid input…" for a failed filter parse. */
export function filterError(err: ZodError): string {
  const issue = err.issues[0];
  return issue ? `${issue.path.join(".") || "filters"}: ${issue.message}` : "Invalid filters";
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return json(
      { error: { code: "bad_request", message: `${where}${issue?.message ?? "Invalid request"}` } },
      { status: 400 },
    );
  }
  console.error(err);
  Sentry.captureException(err);
  return json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: typed errors become `{error: {code, message}}` responses. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Send a JSON body.");
  }
  return schema.parse(body);
}

export function queryAll(req: Request): (name: string) => string[] {
  const params = new URL(req.url).searchParams;
  return (name) => params.getAll(name);
}

/** The viewer's country from the edge's geo header; null when unknown. */
export function viewerCountry(req: Request): string | null {
  const raw = req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry");
  return raw && /^[A-Z]{2}$/.test(raw) && raw !== "XX" ? raw : null;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
