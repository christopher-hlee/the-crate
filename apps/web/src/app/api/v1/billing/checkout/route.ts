import { CheckoutRequestSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { stripe } from "@/server/billing";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { clientIp, HttpError, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** Stripe Checkout for Pro on the web. The webhook records the result in `subscriptions`. */
export const POST = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const { interval } = await readJson(req, CheckoutRequestSchema);
  const e = env();
  const price = interval === "year" ? e.STRIPE_PRICE_YEAR : e.STRIPE_PRICE_MONTH;
  if (!price) throw new HttpError(404, "not_found", "Billing isn't set up on this server.");
  const existing = await pool.query<{ stripe_customer_id: string | null }>(
    "select stripe_customer_id from subscriptions where user_id = $1",
    [viewer.userId],
  );
  const origin = e.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: viewer.userId,
    customer: existing.rows[0]?.stripe_customer_id ?? undefined,
    customer_email: existing.rows[0]?.stripe_customer_id ? undefined : (viewer.email ?? undefined),
    subscription_data: { metadata: { user_id: viewer.userId } },
    allow_promotion_codes: true,
    success_url: `${origin}/account?upgraded=1`,
    cancel_url: `${origin}/account`,
  });
  if (!session.url) throw new HttpError(500, "internal", "Checkout didn't return a URL.");
  return json({ url: session.url });
});
