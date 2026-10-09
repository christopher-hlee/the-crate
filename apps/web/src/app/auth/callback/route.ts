import { NextResponse } from "next/server";
import { type AuthErrorCode, authErrorCode, loginErrorPath, safeNextPath } from "@/lib/sign-in";
import { supabaseFromCookies } from "@/server/auth";
import { env } from "@/server/env";

/**
 * Landing for OAuth, magic links, sign-up confirmations and password resets. Only PKCE `code`
 * links are accepted: a code works only in the browser (or app) that asked for it, which holds
 * the code verifier, so a link someone else sends can't sign a visitor into the sender's account.
 * Links that carry a bare `token_hash` would work from any browser, so they are refused.
 *
 * Failures go back to /login with a fixed error code (never Supabase's free text), keeping `next`.
 * Redirects use the public origin, so they work behind a proxy that rewrites the host.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const next = safeNextPath(q.get("next"));
  const origin = env().NEXT_PUBLIC_APP_URL ?? url.origin;
  const go = (path: string) => NextResponse.redirect(new URL(path, origin));
  const fail = (code: AuthErrorCode | "callback") => go(loginErrorPath(code, next));

  // The provider or Supabase refused before handing us a code (expired link, denied consent).
  if (q.has("error") || q.has("error_code") || q.has("error_description")) {
    return fail(authErrorCode(q.get("error_code"), q.get("error")));
  }

  const code = q.get("code");
  if (!code) return fail("incomplete_link");
  const supabase = await supabaseFromCookies();
  if (!supabase) return fail("not_configured");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(authErrorCode(error.code));
  return go(next);
}
