// User-facing text for API errors. Pure so it can be tested off-device.

import { ApiError, type ErrorCode } from "@app/api-client";

type Overrides = Partial<Record<ErrorCode | "network", string>>;

const DEFAULTS: Overrides = {
  network: "Couldn't reach the crate. Check your connection and try again.",
  rate_limited: "That's a lot at once. Wait a moment, then try again.",
  unauthorized: "Sign in again to carry on.",
};

/** The server's message for expected errors (limits, Pro, conflicts); `fallback` otherwise. */
export function errorMessage(err: unknown, fallback: string, overrides: Overrides = {}): string {
  if (!(err instanceof ApiError)) return fallback;
  const override = overrides[err.code] ?? DEFAULTS[err.code];
  if (override) return override;
  if (err.code === "internal" || !err.message) return fallback;
  return err.message;
}

export function isApiError(err: unknown, code: ErrorCode): boolean {
  return err instanceof ApiError && err.code === code;
}
