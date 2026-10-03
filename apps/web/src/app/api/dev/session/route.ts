import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { DEV_USER_COOKIE } from "@/server/auth";
import { env } from "@/server/env";
import { json, notFound, route } from "@/server/http";

// Local development and end-to-end tests only: sign in as a made-up user without Supabase.
// env() refuses AUTH_MODE=dev on Vercel, and this route 404s in any other mode.

const Body = z.object({ userId: z.uuid().optional() });

export const POST = route(async (req) => {
  if (env().authMode !== "dev") throw notFound();
  const body = Body.parse(await req.json().catch(() => ({})));
  const userId = body.userId ?? randomUUID();
  (await cookies()).set(DEV_USER_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  return json({ userId });
});

export const DELETE = route(async () => {
  if (env().authMode !== "dev") throw notFound();
  (await cookies()).delete(DEV_USER_COOKIE);
  return json({ ok: true });
});
