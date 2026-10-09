// Sign-in helpers shared by the login page, the auth callback and every "Sign in" link.
// Plain functions (no "use client"), so server route handlers can import them too.

import type { EmailOtpType, Provider } from "@supabase/supabase-js";

/** Minimum length for a new password, at sign-up and on /account/password. */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : null;
}

const NEXT_BASE = "https://next.invalid";

/**
 * Where to go after signing in. Only same-origin relative paths that start with "/" (never
 * "//" or a backslash, which browsers read as "/") pass; anything else falls back. The sign-in
 * routes themselves fall back too, so a link can't loop back to the login page.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) return fallback;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, NEXT_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== NEXT_BASE) return fallback;
  // Normalising removes dot segments, so "/.//evil.example" becomes "//evil.example": check the
  // result again, since a path starting "//" is protocol-relative and leaves the site.
  const out = `${url.pathname}${url.search}${url.hash}`;
  if (out.startsWith("//") || /^\/(login|auth)(\/|$)/.test(url.pathname)) return fallback;
  return out;
}

/**
 * The sign-in link for the page at `pathname` (with its query string, when known). On the
 * login page itself the link keeps the `next` it already has.
 */
export function loginHref(pathname: string, search?: URLSearchParams | string | null): string {
  const params = new URLSearchParams(search ?? undefined);
  const current = params.toString();
  const next = /^\/(login|auth)(\/|$)/.test(pathname)
    ? safeNextPath(params.get("next"))
    : safeNextPath(`${pathname}${current ? `?${current}` : ""}`);
  return `/login?next=${encodeURIComponent(next)}`;
}

/** The Supabase redirect target for email links and OAuth: our callback, carrying `next`. */
export function authCallbackUrl(origin: string, next: string): string {
  const url = new URL("/auth/callback", origin);
  const safe = safeNextPath(next);
  if (safe !== "/") url.searchParams.set("next", safe);
  return url.toString();
}

/**
 * OAuth providers the login page knows how to label. Spotify is left out on purpose: the app
 * stays clear of Spotify's APIs (rule 18).
 */
export const OAUTH_PROVIDER_LABELS = {
  apple: "Apple",
  azure: "Microsoft",
  discord: "Discord",
  facebook: "Facebook",
  github: "GitHub",
  gitlab: "GitLab",
  google: "Google",
  linkedin_oidc: "LinkedIn",
  slack_oidc: "Slack",
  twitch: "Twitch",
  twitter: "X",
} as const satisfies Partial<Record<Provider, string>>;

export type OAuthProvider = keyof typeof OAUTH_PROVIDER_LABELS;

function isOAuthProvider(value: string): value is OAuthProvider {
  return Object.hasOwn(OAUTH_PROVIDER_LABELS, value);
}

/**
 * NEXT_PUBLIC_AUTH_PROVIDERS, a comma list such as "google,apple": the OAuth buttons to show,
 * in that order. Unknown names and repeats are dropped; unset means email sign-in only.
 */
export function parseAuthProviders(raw: string | null | undefined): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  for (const part of (raw ?? "").split(",")) {
    const name = part.trim().toLowerCase();
    if (isOAuthProvider(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

const GENERIC_AUTH_ERROR = "Sign-in didn't complete. Try again.";

/**
 * Fixed words for the sign-in errors we expect: the callback's own codes, the OAuth `error`
 * values and Supabase's error codes. The login page only ever shows these, never text from the
 * URL, so a crafted link can't put its own message on the sign-in page.
 */
const AUTH_ERROR_COPY = {
  // The callback's own.
  not_configured: "Sign-in isn't configured on this server.",
  incomplete_link: "That sign-in link is incomplete. Request a new one.",
  // OAuth providers (`error`).
  access_denied: "Sign-in was cancelled or refused. Try again.",
  temporarily_unavailable: "Sign-in is busy right now. Try again in a moment.",
  // Supabase (`error_code`, or AuthError.code).
  otp_expired: "That link has expired or was already used. Request a new one.",
  otp_disabled: "Email links are turned off. Sign in with your password instead.",
  bad_jwt: "Your session couldn't be checked. Sign in again.",
  session_expired: "Your session has expired. Sign in again.",
  flow_state_expired: "That sign-in took too long. Start again.",
  flow_state_not_found: "That sign-in has already finished or expired. Start again.",
  bad_code_verifier:
    "Open the link in the browser you asked for it from, or request a new one here.",
  bad_oauth_state: "That sign-in didn't match this browser. Start again.",
  bad_oauth_callback: "The sign-in provider sent back an incomplete answer. Try again.",
  signup_disabled: "New accounts can't be created right now.",
  email_not_confirmed: "Confirm your email first: the link is in your inbox.",
  invalid_credentials: "That email and password don't match.",
  user_banned: "This account can't sign in.",
  user_already_exists: "There's already an account with that email. Sign in instead.",
  email_exists: "There's already an account with that email. Sign in instead.",
  email_address_invalid: "That email address can't be used. Try another.",
  provider_disabled: "That sign-in method is turned off.",
  email_provider_disabled: "Email sign-in is turned off.",
  over_email_send_rate_limit: "Too many emails were sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many tries. Wait a few minutes and try again.",
} as const satisfies Record<string, string>;

export type AuthErrorCode = keyof typeof AUTH_ERROR_COPY;

export function isAuthErrorCode(raw: string | null | undefined): raw is AuthErrorCode {
  return typeof raw === "string" && Object.hasOwn(AUTH_ERROR_COPY, raw);
}

/** The first known code among `candidates`, or "callback" (shown as a generic message). */
export function authErrorCode(
  ...candidates: (string | null | undefined)[]
): AuthErrorCode | "callback" {
  return candidates.find(isAuthErrorCode) ?? "callback";
}

/** The fixed message for an error code; anything unknown gets a generic one. */
export function authErrorMessage(code: string | null | undefined): string {
  return isAuthErrorCode(code) ? AUTH_ERROR_COPY[code] : GENERIC_AUTH_ERROR;
}

/**
 * The message for a failed sign-in redirect (query string or fragment). Supabase sends
 * `error`, `error_code` and `error_description`: only the codes are read, and only known codes
 * get their own words. error_description is never shown, since anyone can write it into a link.
 */
export function authErrorText(params: URLSearchParams): string | null {
  if (!["error", "error_code", "error_description"].some((k) => params.has(k))) return null;
  return authErrorMessage(authErrorCode(params.get("error_code"), params.get("error")));
}

/** /login showing the fixed message for `code`, keeping `next`. */
export function loginErrorPath(code: AuthErrorCode | "callback", next: string): string {
  const params = new URLSearchParams({ error: code });
  const safe = safeNextPath(next);
  if (safe !== "/") params.set("next", safe);
  return `/login?${params}`;
}

/** Supabase's email link types (EmailOtpType), for links that carry a token_hash. */
const EMAIL_LINK_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export function emailLinkType(raw: string | null | undefined): EmailLinkType | null {
  return EMAIL_LINK_TYPES.find((t) => t === raw) ?? null;
}

/** An email link's token_hash, when it is there and of a sane length. */
export function emailLinkToken(raw: string | null | undefined): string | null {
  return raw && raw.length <= 512 ? raw : null;
}

/** Where an email link goes once verified: a safe `next`, or after a reset link, the password page. */
export function emailLinkNext(type: EmailLinkType | null, next: string | null | undefined): string {
  return safeNextPath(next, type === "recovery" ? "/account/password" : "/");
}

/**
 * The confirmation page for an email link that carries a token_hash. Opening the link never
 * signs anyone in: that page asks for a click, which POSTs the token to /auth/verify. A mail
 * scanner can't use the link up, and a link someone else sends can't quietly sign a visitor
 * into the sender's account.
 */
export function emailConfirmPath(tokenHash: string, type: EmailLinkType, next: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type });
  const safe = safeNextPath(next);
  if (safe !== "/") params.set("next", safe);
  return `/auth/confirm?${params}`;
}

function originOf(raw: string): string | null {
  try {
    const origin = new URL(raw).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Whether a form POST came from one of our own pages: its Origin header, or when a browser
 * leaves that out, its Referer, must be one of `origins`. A request with neither is refused.
 */
export function isSameOriginPost(
  headers: Pick<Headers, "get">,
  origins: readonly string[],
): boolean {
  const source = headers.get("origin") ?? headers.get("referer");
  const from = source ? originOf(source) : null;
  return from !== null && origins.some((o) => originOf(o) === from);
}
