// Sign-in helpers shared by the login page, the auth callback and every "Sign in" link.
// Plain functions (no "use client"), so server route handlers can import them too.

import type { Provider } from "@supabase/supabase-js";

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
  if (/^\/(login|auth)(\/|$)/.test(url.pathname)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
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

/** Supabase error text from a redirect, trimmed so a crafted link can't fill the page. */
export function authErrorText(params: URLSearchParams): string | null {
  const description = params.get("error_description")?.trim();
  if (description) return description.slice(0, 300);
  return params.get("error") ? "Sign-in didn't complete. Try again." : null;
}
