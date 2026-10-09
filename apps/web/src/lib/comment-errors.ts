import { ApiError } from "@app/api-client";

/**
 * What to show when a comment, report or block request fails: the server's own message
 * (rate limits, the link filter, a missing display name), or `fallback` when the request never
 * got an answer, failed unexpectedly or came back without a message of ours.
 */
export function failureMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError) || err.code === "network" || err.code === "internal")
    return fallback;
  if (!err.message || /^HTTP \d+$/.test(err.message)) return fallback;
  return err.message;
}
