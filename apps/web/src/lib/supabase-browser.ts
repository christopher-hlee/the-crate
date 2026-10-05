"use client";

import { createBrowserClient } from "@supabase/ssr";
import { parseAuthProviders } from "./sign-in";

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === "dev" ? "dev" : "supabase";

/** OAuth buttons on the login page, from NEXT_PUBLIC_AUTH_PROVIDERS (e.g. "google,apple"). */
export const AUTH_PROVIDERS = parseAuthProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS);

/** The browser client (a singleton in the browser); null when Supabase isn't configured. */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

/** Ends the session: Supabase sign-out, or in dev mode, drops the dev cookie. */
export async function signOut(): Promise<void> {
  if (AUTH_MODE === "dev") {
    const res = await fetch("/api/dev/session", { method: "DELETE" });
    if (!res.ok) throw new Error("Couldn't sign out. Try again.");
    return;
  }
  const supabase = supabaseBrowser();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
