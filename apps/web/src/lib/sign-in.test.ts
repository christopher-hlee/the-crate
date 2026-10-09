import { describe, expect, it } from "vitest";
import {
  authCallbackUrl,
  authErrorCode,
  authErrorMessage,
  authErrorText,
  loginErrorPath,
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
  const text = (query: string) => authErrorText(new URLSearchParams(query));
  const GENERIC = "Sign-in didn't complete. Try again.";

  it("shows fixed copy for known codes, preferring error_code over error", () => {
    expect(text("error=access_denied&error_code=otp_expired")).toMatch(/expired/);
    expect(text("error=access_denied")).toMatch(/cancelled/);
    expect(text("error_code=flow_state_expired")).toMatch(/took too long/);
    expect(text("error=not_configured")).toBe("Sign-in isn't configured on this server.");
    expect(text("error=incomplete_link")).toMatch(/can.t be used/);
  });

  it("never shows error_description, whatever it says", () => {
    const spoof = "Your account is locked. Verify at crate-help.example within 24h";
    for (const query of [
      `error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent(spoof)}`,
      `error_description=${encodeURIComponent(spoof)}`,
      `error=x&error_description=${encodeURIComponent(spoof)}`,
    ]) {
      expect(text(query)).not.toContain("crate-help");
      expect(text(query)).not.toContain("locked");
    }
    expect(text(`error_description=${encodeURIComponent(spoof)}`)).toBe(GENERIC);
  });

  it("falls back to a generic message for unknown codes, and to nothing without an error", () => {
    expect(text("error=callback")).toBe(GENERIC);
    expect(text("error=Your+account+is+locked")).toBe(GENERIC);
    expect(text("error=constructor")).toBe(GENERIC);
    expect(text("error=__proto__")).toBe(GENERIC);
    expect(text("")).toBeNull();
    expect(text("next=%2Fcrates")).toBeNull();
  });
});

describe("authErrorCode and authErrorMessage", () => {
  it("passes on only known codes", () => {
    expect(authErrorCode("otp_expired")).toBe("otp_expired");
    expect(authErrorCode(null, "access_denied")).toBe("access_denied");
    expect(authErrorCode("made_up", "otp_disabled")).toBe("otp_disabled");
    expect(authErrorCode("Your account is locked", undefined)).toBe("callback");
    expect(authErrorCode("toString")).toBe("callback");
    expect(authErrorCode()).toBe("callback");
  });

  it("covers the Supabase codes a link or sign-in can fail with", () => {
    for (const code of [
      "otp_expired",
      "access_denied",
      "otp_disabled",
      "bad_jwt",
      "flow_state_expired",
      "flow_state_not_found",
      "bad_code_verifier",
      "signup_disabled",
      "email_not_confirmed",
      "invalid_credentials",
    ]) {
      expect(authErrorCode(code)).toBe(code);
      expect(authErrorMessage(code)).not.toBe(authErrorMessage("callback"));
    }
    expect(authErrorMessage(undefined)).toBe("Sign-in didn't complete. Try again.");
  });
});

describe("loginErrorPath", () => {
  it("sends a fixed code and keeps a safe next", () => {
    expect(loginErrorPath("otp_expired", "/")).toBe("/login?error=otp_expired");
    expect(loginErrorPath("callback", "/crates")).toBe("/login?error=callback&next=%2Fcrates");
  });
});
