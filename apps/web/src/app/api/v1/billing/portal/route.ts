import { requireViewer } from "@/server/auth";
import { stripe } from "@/server/billing";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { json, notFound, route } from "@/server/http";

/** Stripe's Customer Portal: change plan, update the card, cancel. */
export const POST = route(async (req) => {
  const viewer = await requireViewer(req);
  const res = await db().query<{ stripe_customer_id: string | null }>(
    "select stripe_customer_id from subscriptions where user_id = $1",
    [viewer.userId],
  );
  const customer = res.rows[0]?.stripe_customer_id;
  if (!customer) throw notFound("A web subscription");
  const origin = env().NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const session = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${origin}/account`,
  });
  return json({ url: session.url });
});
