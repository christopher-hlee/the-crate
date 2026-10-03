import { handleStripeEvent, stripe } from "@/server/billing";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { badRequest, json, route } from "@/server/http";

/** Stripe subscription changes, verified by signature over the raw body. */
export const POST = route(async (req) => {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) throw badRequest("Missing signature");
  const client = stripe();
  const payload = await req.text();
  let event: Awaited<ReturnType<typeof client.webhooks.constructEventAsync>>;
  try {
    event = await client.webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    throw badRequest("Invalid signature");
  }
  await handleStripeEvent(db(), event, client);
  return json({ received: true });
});
