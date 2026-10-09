import { NextResponse } from "next/server";
import {
  type AuthErrorCode,
  authErrorCode,
  emailConfirmPath,
  emailLinkNext,
  emailLinkToken,
  emailLinkType,
  loginErrorPath,
} from "@/lib/sign-in";
import { supabaseFromCookies } from "@/server/auth";

/**
 * Landing for OAuth, magic links, sign-up confirmations and password resets.
 *
 * - `code` (PKCE): exchanged for a session cookie here. The code only works in the browser that
 *   started sign-in, which holds the code verifier.
 * - `token_hash` and `type`: never verified on this GET, since such a link works from any browser.
 *   It goes on to /auth/confirm, which asks for a click and POSTs to /auth/verify.
 *
 * Failures go back to /login with a fixed error code (never Supabase's free text), keeping `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const type = emailLinkType(q.get("type"));
  const next = emailLinkNext(type, q.get("next"));
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  const fail = (code: AuthErrorCode | "callback") => go(loginErrorPath(code, next));

  // The provider or Supabase refused before handing us a code (expired link, denied consent).
  if (q.has("error") || q.has("error_code") || q.has("error_description")) {
    return fail(authErrorCode(q.get("error_code"), q.get("error")));
  }

  const code = q.get("code");
  if (code) {
    const supabase = await supabaseFromCookies();
    if (!supabase) return fail("not_configured");
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(authErrorCode(error.code));
    return go(next);
  }

  const tokenHash = emailLinkToken(q.get("token_hash"));
  if (tokenHash && type) return go(emailConfirmPath(tokenHash, type, next));
  return fail("incomplete_link");
}
