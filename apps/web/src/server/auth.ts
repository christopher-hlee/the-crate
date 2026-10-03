import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "./env";
import { unauthorized } from "./http";

export type Viewer = { userId: string; email: string | null };

export const DEV_USER_COOKIE = "crate_dev_user";
const Uuid = z.uuid();

/** Supabase client bound to the request cookies (web sessions). */
export async function supabaseFromCookies() {
  const e = env();
  if (!e.supabaseUrl || !e.anonKey) return null;
  const store = await cookies();
  return createServerClient(e.supabaseUrl, e.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

async function viaSupabase(req: Request): Promise<Viewer | null> {
  const e = env();
  if (!e.supabaseUrl || !e.anonKey) return null;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const client = bearer
    ? createClient(e.supabaseUrl, e.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await supabaseFromCookies();
  if (!client) return null;
  const { data, error } = await client.auth.getClaims(bearer);
  if (error || !data?.claims?.sub) return null;
  const sub = Uuid.safeParse(data.claims.sub);
  if (!sub.success) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { userId: sub.data, email };
}

async function viaDev(req: Request): Promise<Viewer | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+dev:(.+)$/i)?.[1];
  const raw = bearer ?? (await cookies()).get(DEV_USER_COOKIE)?.value;
  const parsed = Uuid.safeParse(raw);
  return parsed.success
    ? { userId: parsed.data, email: `${parsed.data.slice(0, 8)}@dev.local` }
    : null;
}

/** The signed-in viewer, or null. Cookies on the web, `Authorization: Bearer` on mobile. */
export async function getViewer(req: Request): Promise<Viewer | null> {
  return env().authMode === "dev" ? viaDev(req) : viaSupabase(req);
}

export async function requireViewer(req: Request): Promise<Viewer> {
  const viewer = await getViewer(req);
  if (!viewer) throw unauthorized();
  return viewer;
}
