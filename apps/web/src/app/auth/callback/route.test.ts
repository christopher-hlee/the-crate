import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn() };
const supabaseFromCookies = vi.fn();
vi.mock("@/server/auth", () => ({ supabaseFromCookies }));

const { GET } = await import("./route");

const ORIGIN = "https://crate.example";
const call = (query: string) => GET(new Request(`${ORIGIN}/auth/callback?${query}`));
const location = (res: Response) => new URL(res.headers.get("location") ?? "", ORIGIN);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseFromCookies.mockResolvedValue({ auth });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("GET /auth/callback", () => {
  it("never verifies a token_hash: it goes to the confirmation page instead", async () => {
    const res = await call("token_hash=abc123&type=magiclink&next=%2Fcrates");
    expect(res.status).toBe(307);
    const to = location(res);
    expect(to.origin).toBe(ORIGIN);
    expect(to.pathname).toBe("/auth/confirm");
    expect(Object.fromEntries(to.searchParams)).toEqual({
      token_hash: "abc123",
      type: "magiclink",
      next: "/crates",
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(supabaseFromCookies).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sends a reset link to the password page by default", async () => {
    const to = location(await call("token_hash=abc&type=recovery"));
    expect(to.pathname).toBe("/auth/confirm");
    expect(to.searchParams.get("next")).toBe("/account/password");
  });

  it("refuses unknown link types and missing tokens", async () => {
    for (const query of ["token_hash=abc&type=sms", "token_hash=abc", "type=magiclink", ""]) {
      const to = location(await call(query));
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("error")).toBe("incomplete_link");
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
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
