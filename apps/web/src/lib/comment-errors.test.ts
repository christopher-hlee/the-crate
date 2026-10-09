import { ApiError } from "@app/api-client";
import { describe, expect, it } from "vitest";
import { failureMessage } from "./comment-errors";

describe("failureMessage", () => {
  const fallback = "Couldn't delete the comment. Try again.";

  it("shows the server's own message for expected failures", () => {
    const limited = new ApiError(429, "rate_limited", "Slow down a little and try again shortly.");
    expect(failureMessage(limited, fallback)).toBe("Slow down a little and try again shortly.");
    const link = new ApiError(400, "bad_request", "Comments can't include links.");
    expect(failureMessage(link, fallback)).toBe("Comments can't include links.");
  });

  it("falls back when there's nothing useful to show", () => {
    expect(failureMessage(new ApiError(0, "network", "Failed to fetch"), fallback)).toBe(fallback);
    expect(failureMessage(new ApiError(500, "internal", "Something went wrong."), fallback)).toBe(
      fallback,
    );
    expect(failureMessage(new ApiError(429, "rate_limited", "HTTP 429"), fallback)).toBe(fallback);
    expect(failureMessage(new Error("boom"), fallback)).toBe(fallback);
  });
});
