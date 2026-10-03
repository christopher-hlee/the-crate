import "server-only";
import { type BillingSource, mergeSubscription, type SubscriptionState } from "@app/core";
import type { Queryable } from "@app/db";
import Stripe from "stripe";
import { z } from "zod";
import { env } from "./env";
import { HttpError } from "./http";

export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(404, "not_found", "Billing isn't set up on this server.");
  return new Stripe(key);
}

/** Applies a billing event to `subscriptions`, merging across sources (one `pro` entitlement). */
export async function applySubscription(
  db: Queryable,
  userId: string,
  incoming: SubscriptionState,
  stripeIds?: { customer?: string | null; subscription?: string | null },
): Promise<void> {
  const res = await db.query<{
    plan: "free" | "pro";
    source: BillingSource | null;
    expires_at: Date | null;
  }>("select plan, source, expires_at from subscriptions where user_id = $1", [userId]);
  const row = res.rows[0];
  const current = row ? { plan: row.plan, source: row.source, expiresAt: row.expires_at } : null;
  const next = mergeSubscription(current, incoming, new Date());
  await db.query(
    `insert into subscriptions (user_id, plan, source, expires_at, stripe_customer_id, stripe_subscription_id, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (user_id) do update set plan = excluded.plan, source = excluded.source,
       expires_at = excluded.expires_at,
       stripe_customer_id = coalesce(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
       stripe_subscription_id = coalesce(excluded.stripe_subscription_id, subscriptions.stripe_subscription_id),
       updated_at = now()`,
    [
      userId,
      next.plan,
      next.source,
      next.expiresAt,
      stripeIds?.customer ?? null,
      stripeIds?.subscription ?? null,
    ],
  );
}

const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Plan state from a Stripe subscription. The period end lives on its items. */
export function stateFromStripe(sub: Stripe.Subscription): SubscriptionState {
  const periodEnd = sub.items.data.reduce<number | null>(
    (max, item) => (max === null || item.current_period_end > max ? item.current_period_end : max),
    null,
  );
  if (PRO_STATUSES.has(sub.status)) {
    return {
      plan: "pro",
      source: "stripe",
      expiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
    };
  }
  return {
    plan: "free",
    source: "stripe",
    expiresAt: sub.ended_at ? new Date(sub.ended_at * 1000) : new Date(),
  };
}

const Uuid = z.uuid();

function userIdOf(sub: Stripe.Subscription): string | null {
  const id = sub.metadata?.user_id;
  return Uuid.safeParse(id).success ? (id as string) : null;
}

export async function handleStripeEvent(
  db: Queryable,
  event: Stripe.Event,
  client: Stripe,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (!userId || !Uuid.safeParse(userId).success || typeof session.subscription !== "string")
        return;
      const sub = await client.subscriptions.retrieve(session.subscription);
      await applySubscription(db, userId, stateFromStripe(sub), {
        customer: typeof session.customer === "string" ? session.customer : null,
        subscription: sub.id,
      });
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = userIdOf(sub);
      if (!userId) return;
      await applySubscription(db, userId, stateFromStripe(sub), {
        customer: typeof sub.customer === "string" ? sub.customer : null,
        subscription: sub.id,
      });
      return;
    }
    default:
      return;
  }
}

// RevenueCat: the app stores, on the same `pro` entitlement. app_user_id is the Supabase user ID.

export const RevenueCatEventSchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string().optional(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    entitlement_ids: z.array(z.string()).nullable().optional(),
    entitlement_id: z.string().nullable().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    store: z.string().optional(),
  }),
});

const GRANTING = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "CANCELLATION",
]);

export function stateFromRevenueCat(e: z.infer<typeof RevenueCatEventSchema>["event"]): {
  userId: string | null;
  state: SubscriptionState | null;
} {
  const candidates = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])];
  const userId = candidates.find((c) => c && Uuid.safeParse(c).success) ?? null;
  const entitlements = [
    ...(e.entitlement_ids ?? []),
    ...(e.entitlement_id ? [e.entitlement_id] : []),
  ];
  const source: BillingSource | null =
    e.store === "PLAY_STORE"
      ? "play_store"
      : e.store === "APP_STORE" || e.store === "MAC_APP_STORE"
        ? "app_store"
        : null;
  if (!source) return { userId, state: null }; // Stripe is handled directly; promos are manual.
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms) : null;
  if (e.type === "EXPIRATION")
    return { userId, state: { plan: "free", source, expiresAt: expiresAt ?? new Date() } };
  if (GRANTING.has(e.type) && (entitlements.length === 0 || entitlements.includes("pro"))) {
    // A cancellation keeps Pro until the paid period ends.
    return { userId, state: { plan: "pro", source, expiresAt } };
  }
  return { userId, state: null };
}
