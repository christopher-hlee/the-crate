import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn() };
const supabaseFromCookies = vi.fn();
vi.mock("@/server/auth", () => ({ supabaseFromCookies }));
const appEnv: { NEXT_PUBLIC_APP_URL?: string } = {};
vi.mock("@/server/env", () => ({ env: () => appEnv }));

const { GET } = await import("./route");

const ORIGIN = "https://crate.example";
const call = (query: string) => GET(new Request(`${ORIGIN}/auth/callback?${query}`));
const location = (res: Response) => new URL(res.headers.get("location") ?? "", ORIGIN);

beforeEach(() => {
  vi.clearAllMocks();
  delete appEnv.NEXT_PUBLIC_APP_URL;
  supabaseFromCookies.mockResolvedValue({ auth });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("GET /auth/callback", () => {
  it("never verifies a bare token_hash: only PKCE codes sign anyone in", async () => {
    for (const query of [
      "token_hash=abc123&type=magiclink&next=%2Fcrates",
      "token_hash=abc&type=recovery",
      "type=magiclink",
      "",
    ]) {
      const res = await call(query);
      const to = location(res);
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("error")).toBe("incomplete_link");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(supabaseFromCookies).not.toHaveBeenCalled();
  });

  it("redirects to the public origin behind a proxy that rewrites the host", async () => {
    appEnv.NEXT_PUBLIC_APP_URL = "https://public.example";
    const res = await GET(new Request("http://localhost:3000/auth/callback?code=c&next=%2Fcrates"));
    expect(res.headers.get("location")).toBe("https://public.example/crates");
  });

  it("exchanges a PKCE code and goes to next", async () => {
    const res = await call("code=pkce-code&next=%2Fhistory");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(location(res).toString()).toBe(`${ORIGIN}/history`);
  });

  it("passes a failed exchange on as a fixed code", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      error: { code: "bad_code_verifier", message: "code challenge does not match" },
    });
    const to = location(await call("code=x&next=%2Fcrates"));
    expect(to.pathname).toBe("/login");
    expect(Object.fromEntries(to.searchParams)).toEqual({
      error: "bad_code_verifier",
      next: "/crates",
    });

    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "Something odd" } });
    expect(location(await call("code=x")).search).toBe("?error=callback");
  });

  it("says so when Supabase isn't configured", async () => {
    supabaseFromCookies.mockResolvedValue(null);
    expect(location(await call("code=x")).search).toBe("?error=not_configured");
  });

  it("passes on only known error codes, never error_description", async () => {
    const spoof = encodeURIComponent("Your account is locked. Verify at crate-help.example");
    const cases: [string, string][] = [
      [`error=access_denied&error_code=otp_expired&error_description=${spoof}`, "otp_expired"],
      [`error=access_denied&error_description=${spoof}`, "access_denied"],
      [`error_description=${spoof}`, "callback"],
      [`error=${spoof}`, "callback"],
    ];
    for (const [query, code] of cases) {
      const res = await call(query);
      const to = location(res);
      expect(to.pathname).toBe("/login");
      expect(Object.fromEntries(to.searchParams)).toEqual({ error: code });
      expect(res.headers.get("location")).not.toContain("crate-help");
    }
    expect(supabaseFromCookies).not.toHaveBeenCalled();
  });
});
