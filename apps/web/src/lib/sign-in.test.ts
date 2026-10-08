import { describe, expect, it } from "vitest";
import {
  authCallbackUrl,
  authErrorText,
  loginHref,
  parseAuthProviders,
  passwordProblem,
  safeNextPath,
} from "./sign-in";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths with their query and hash", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/records/m%3A12?v=abcdefghijk")).toBe("/records/m%3A12?v=abcdefghijk");
    expect(safeNextPath("/?styles=House#top")).toBe("/?styles=House#top");
    expect(safeNextPath("/account/password")).toBe("/account/password");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "records",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/.//evil.example",
      "/x/..//evil.example",
      "/%2e//evil.example",
      "/./%2e//evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
    ]) {
      const out = safeNextPath(bad);
      expect(out.startsWith("/") && !out.startsWith("//")).toBe(true);
      expect(out).not.toContain("evil");
    }
    expect(safeNextPath("//evil.example", "/account")).toBe("/account");
  });

  it("doesn't send people back to the sign-in routes", () => {
    expect(safeNextPath("/login?next=/crates")).toBe("/");
    expect(safeNextPath("/auth/callback")).toBe("/");
    expect(safeNextPath("/loginhelp")).toBe("/loginhelp");
  });
});

describe("loginHref", () => {
  it("carries the current path and query as next", () => {
    expect(loginHref("/crates")).toBe("/login?next=%2Fcrates");
    expect(loginHref("/", "styles=Deep+House")).toBe(
      `/login?next=${encodeURIComponent("/?styles=Deep+House")}`,
    );
  });

  it("keeps the existing next on the login page", () => {
    expect(loginHref("/login", "next=%2Fhistory")).toBe("/login?next=%2Fhistory");
    expect(loginHref("/login", "next=%2F%2Fevil.example")).toBe("/login?next=%2F");
  });
});

describe("authCallbackUrl", () => {
  it("points at the callback with a safe next", () => {
    expect(authCallbackUrl("https://crate.example", "/crates")).toBe(
      "https://crate.example/auth/callback?next=%2Fcrates",
    );
    expect(authCallbackUrl("https://crate.example", "/")).toBe(
      "https://crate.example/auth/callback",
    );
    expect(authCallbackUrl("https://crate.example", "//evil.example")).toBe(
      "https://crate.example/auth/callback",
    );
  });
});

describe("parseAuthProviders", () => {
  it("reads a comma list, in order, without unknowns or repeats", () => {
    expect(parseAuthProviders(undefined)).toEqual([]);
    expect(parseAuthProviders("")).toEqual([]);
    expect(parseAuthProviders(" Google , apple,google,myspace,spotify")).toEqual([
      "google",
      "apple",
    ]);
  });
});

describe("passwordProblem", () => {
  it("asks for at least 8 characters", () => {
    expect(passwordProblem("1234567")).toMatch(/at least 8/);
    expect(passwordProblem("12345678")).toBeNull();
  });
});

describe("authErrorText", () => {
  it("prefers Supabase's error_description", () => {
    expect(
      authErrorText(
        new URLSearchParams(
          "error=access_denied&error_description=Email+link+is+invalid+or+has+expired",
        ),
      ),
    ).toBe("Email link is invalid or has expired");
    expect(authErrorText(new URLSearchParams("error=callback"))).toMatch(/didn't complete/);
    expect(authErrorText(new URLSearchParams(""))).toBeNull();
    expect(
      authErrorText(new URLSearchParams({ error_description: "x".repeat(1000) }))?.length,
    ).toBe(300);
  });
});
