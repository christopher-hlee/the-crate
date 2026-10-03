import { timingSafeEqual } from "node:crypto";
import { applySubscription, RevenueCatEventSchema, stateFromRevenueCat } from "@/server/billing";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { HttpError, json, readJson, route } from "@/server/http";

function matches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const value = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** App Store and Google Play changes from RevenueCat, on the shared `pro` entitlement. */
export const POST = route(async (req) => {
  const secret = env().REVENUECAT_WEBHOOK_SECRET;
  if (!secret || !matches(req.headers.get("authorization"), secret)) {
    throw new HttpError(401, "unauthorized", "Bad webhook secret.");
  }
  const { event } = await readJson(req, RevenueCatEventSchema);
  const { userId, state } = stateFromRevenueCat(event);
  if (userId && state) await applySubscription(db(), userId, state);
  return json({ received: true, applied: Boolean(userId && state) });
});
