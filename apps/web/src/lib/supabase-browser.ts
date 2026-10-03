"use client";

import { createBrowserClient } from "@supabase/ssr";

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === "dev" ? "dev" : "supabase";

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

export async function signOut(): Promise<void> {
  if (AUTH_MODE === "dev") {
    await fetch("/api/dev/session", { method: "DELETE" });
    return;
  }
  await supabaseBrowser()?.auth.signOut();
}
