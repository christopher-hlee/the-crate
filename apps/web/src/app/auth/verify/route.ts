import { NextResponse } from "next/server";
import {
  authErrorCode,
  emailLinkNext,
  emailLinkToken,
  emailLinkType,
  isSameOriginPost,
  loginErrorPath,
} from "@/lib/sign-in";
import { supabaseFromCookies } from "@/server/auth";
import { env } from "@/server/env";

/**
 * The button on /auth/confirm: verifies an email link's token_hash and sets the session cookie.
 * Only a POST from our own pages counts (checked by Origin, or Referer when Origin is missing),
 * so another site can't sign a visitor into an account of its choosing. There is no GET.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  if (!isSameOriginPost(req.headers, appUrl ? [url.origin, appUrl] : [url.origin])) {
    return new Response("Refused: this sign-in request didn't come from this site.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const form = await req.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  const type = emailLinkType(field("type"));
  const tokenHash = emailLinkToken(field("token_hash"));
  const next = emailLinkNext(type, field("next"));
  // 303: the browser follows with a GET.
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin), 303);

  if (!type || !tokenHash) return go(loginErrorPath("incomplete_link", next));
  const supabase = await supabaseFromCookies();
  if (!supabase) return go(loginErrorPath("not_configured", next));
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return go(loginErrorPath(authErrorCode(error.code), next));
  return go(next);
}
