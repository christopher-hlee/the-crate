import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "./env";

const base = {
  authMode: undefined,
  supabaseUrl: undefined,
  vercel: false,
  production: false,
  allowDevAuth: false,
};

describe("resolveAuthMode", () => {
  it("defaults to dev auth only in local development without Supabase", () => {
    expect(resolveAuthMode(base)).toBe("dev");
    expect(resolveAuthMode({ ...base, supabaseUrl: "https://x.supabase.co" })).toBe("supabase");
    expect(
      resolveAuthMode({ ...base, production: true, supabaseUrl: "https://x.supabase.co" }),
    ).toBe("supabase");
  });

  it("never falls back to dev auth on a production server", () => {
    expect(() => resolveAuthMode({ ...base, production: true })).toThrow(
      /production needs real sign-in/,
    );
    expect(() => resolveAuthMode({ ...base, production: true, authMode: "dev" })).toThrow(
      /ALLOW_DEV_AUTH/,
    );
    expect(() =>
      resolveAuthMode({ ...base, authMode: "dev", vercel: true, allowDevAuth: true }),
    ).toThrow(/Vercel/);
  });

  it("lets the end-to-end tests opt in explicitly", () => {
    expect(
      resolveAuthMode({ ...base, production: true, authMode: "dev", allowDevAuth: true }),
    ).toBe("dev");
  });
});
