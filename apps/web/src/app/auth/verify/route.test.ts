import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { verifyOtp: vi.fn() };
const supabaseFromCookies = vi.fn();
vi.mock("@/server/auth", () => ({ supabaseFromCookies }));
vi.mock("@/server/env", () => ({ env: () => ({ NEXT_PUBLIC_APP_URL: "https://crate.example" }) }));

const { POST } = await import("./route");

// The server sees its own address; the public one comes from NEXT_PUBLIC_APP_URL.
const INTERNAL = "http://localhost:3000";

type Fields = Record<string, string>;

function post(fields: Fields, headers: Fields = {}): Request {
  return new Request(`${INTERNAL}/auth/verify`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}

const link = { token_hash: "pkce_abc123", type: "magiclink", next: "/crates" };
const location = (res: Response) => new URL(res.headers.get("location") ?? "", INTERNAL);

beforeEach(() => {
  vi.clearAllMocks();
  supabaseFromCookies.mockResolvedValue({ auth });
  auth.verifyOtp.mockResolvedValue({ error: null });
});

describe("POST /auth/verify", () => {
  it("refuses a POST from another site, or one that doesn't say where it came from", async () => {
    const cases: Fields[] = [
      { origin: "https://evil.example" },
      { origin: "null" },
      { referer: "https://evil.example/page" },
      {},
    ];
    for (const headers of cases) {
      const res = await POST(post(link, headers));
      expect(res.status).toBe(403);
      expect(res.headers.get("location")).toBeNull();
    }
    expect(supabaseFromCookies).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies the token from our own page and goes to next with a GET", async () => {
    const cases: Fields[] = [
      { origin: INTERNAL },
      { origin: "https://crate.example" },
      { referer: "https://crate.example/auth/confirm?token_hash=pkce_abc123" },
    ];
    for (const headers of cases) {
      const res = await POST(post(link, headers));
      expect(res.status).toBe(303);
      expect(location(res).toString()).toBe(`${INTERNAL}/crates`);
    }
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "pkce_abc123" });
  });

  it("keeps next safe, and lands a reset on the password page", async () => {
    const headers = { origin: INTERNAL };
    let res = await POST(post({ ...link, next: "//evil.example" }, headers));
    expect(location(res).toString()).toBe(`${INTERNAL}/`);
    res = await POST(post({ token_hash: "abc", type: "recovery" }, headers));
    expect(location(res).pathname).toBe("/account/password");
  });

  it("passes a failed verification on as a fixed code", async () => {
    auth.verifyOtp.mockResolvedValue({
      error: { code: "otp_expired", message: "Email link is invalid or has expired" },
    });
    const to = location(await POST(post(link, { origin: INTERNAL })));
    expect(to.pathname).toBe("/login");
    expect(Object.fromEntries(to.searchParams)).toEqual({ error: "otp_expired", next: "/crates" });
  });

  it("refuses unknown types and missing tokens without calling Supabase", async () => {
    const cases: Fields[] = [
      { ...link, type: "sms" },
      { type: "magiclink" },
      { ...link, token_hash: "" },
      {},
    ];
    for (const fields of cases) {
      const to = location(await POST(post(fields, { origin: INTERNAL })));
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("error")).toBe("incomplete_link");
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("says so when Supabase isn't configured", async () => {
    supabaseFromCookies.mockResolvedValue(null);
    const to = location(await POST(post(link, { origin: INTERNAL })));
    expect(Object.fromEntries(to.searchParams)).toEqual({
      error: "not_configured",
      next: "/crates",
    });
  });
});
