import { NextResponse } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/sign-in";
import { supabaseFromCookies } from "@/server/auth";

/** Supabase's email link types (EmailOtpType), for links that carry a token_hash. */
const OtpType = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/**
 * Landing for OAuth, magic links, sign-up confirmations and password resets. Exchanges the
 * code (or verifies the email token) for a session cookie, then goes to `next`. Failures go
 * back to /login with Supabase's error_description, keeping `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const otpType = OtpType.safeParse(q.get("type"));
  const recovery = otpType.success && otpType.data === "recovery";
  const next = safeNextPath(q.get("next"), recovery ? "/account/password" : "/");

  const fail = (description: string | null) => {
    const to = new URL("/login", url.origin);
    to.searchParams.set("error", q.get("error") ?? "callback");
    if (description) to.searchParams.set("error_description", description.slice(0, 300));
    if (next !== "/") to.searchParams.set("next", next);
    return NextResponse.redirect(to);
  };

  // The provider or Supabase refused before handing us a code (expired link, denied consent).
  if (q.get("error") || q.get("error_description")) return fail(q.get("error_description"));

  const supabase = await supabaseFromCookies();
  if (!supabase) return fail("Sign-in isn't configured on this server.");

  const code = q.get("code");
  const tokenHash = q.get("token_hash");
  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && otpType.success) {
    ({ error } = await supabase.auth.verifyOtp({ type: otpType.data, token_hash: tokenHash }));
  } else {
    return fail("That sign-in link is incomplete. Request a new one.");
  }
  if (error) return fail(error.message);
  return NextResponse.redirect(new URL(next, url.origin));
}
