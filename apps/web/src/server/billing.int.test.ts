import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applySubscription,
  RevenueCatEventSchema,
  stateFromRevenueCat,
  stateFromStripe,
} from "./billing";
import { planFor } from "./plan";

const USER = "88888888-8888-4888-8888-888888888888";
const future = Math.floor(Date.UTC(2099, 0, 1) / 1000);

function sub(status: string, extra: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status,
    ended_at: null,
    metadata: { user_id: USER },
    customer: "cus_1",
    items: { data: [{ current_period_end: future } as Stripe.SubscriptionItem] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

describe("Stripe mapping", () => {
  it("treats active, trialing and past_due as Pro until the period ends", () => {
    for (const s of ["active", "trialing", "past_due"]) {
      expect(stateFromStripe(sub(s))).toEqual({
        plan: "pro",
        source: "stripe",
        expiresAt: new Date(future * 1000),
      });
    }
  });

  it("ends Pro when the subscription is canceled or unpaid", () => {
    const ended = Math.floor(Date.UTC(2026, 9, 1) / 1000);
    expect(stateFromStripe(sub("canceled", { ended_at: ended }))).toEqual({
      plan: "free",
      source: "stripe",
      expiresAt: new Date(ended * 1000),
    });
    expect(stateFromStripe(sub("unpaid")).plan).toBe("free");
  });
});

describe("RevenueCat mapping", () => {
  const event = (e: Record<string, unknown>) => RevenueCatEventSchema.parse({ event: e }).event;

  it("grants Pro for purchases on the pro entitlement and keeps it through a cancellation", () => {
    const exp = Date.UTC(2099, 0, 1);
    expect(
      stateFromRevenueCat(
        event({
          type: "INITIAL_PURCHASE",
          app_user_id: USER,
          entitlement_ids: ["pro"],
          expiration_at_ms: exp,
          store: "APP_STORE",
        }),
      ),
    ).toEqual({
      userId: USER,
      state: { plan: "pro", source: "app_store", expiresAt: new Date(exp) },
    });
    expect(
      stateFromRevenueCat(
        event({
          type: "CANCELLATION",
          app_user_id: USER,
          entitlement_ids: ["pro"],
          expiration_at_ms: exp,
          store: "PLAY_STORE",
        }),
      ).state,
    ).toEqual({ plan: "pro", source: "play_store", expiresAt: new Date(exp) });
  });

  it("ends Pro on expiration and ignores anonymous users and Stripe events", () => {
    expect(
      stateFromRevenueCat(event({ type: "EXPIRATION", app_user_id: USER, store: "APP_STORE" }))
        .state?.plan,
    ).toBe("free");
    expect(
      stateFromRevenueCat(
        event({ type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", store: "APP_STORE" }),
      ).userId,
    ).toBeNull();
    expect(
      stateFromRevenueCat(event({ type: "INITIAL_PURCHASE", app_user_id: USER, store: "STRIPE" }))
        .state,
    ).toBeNull();
  });

  it("finds the user among aliases", () => {
    const r = stateFromRevenueCat(
      event({
        type: "RENEWAL",
        app_user_id: "$RCAnonymousID:x",
        aliases: [USER],
        store: "APP_STORE",
      }),
    );
    expect(r.userId).toBe(USER);
  });
});

describe("applySubscription", () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it("shares one Pro entitlement across sources", async () => {
    await applySubscription(t.pool, USER, {
      plan: "pro",
      source: "app_store",
      expiresAt: new Date(Date.UTC(2099, 0, 1)),
    });
    expect((await planFor(t.pool, USER)).plan).toBe("pro");
    // A lapsed web subscription must not end the active store subscription.
    await applySubscription(
      t.pool,
      USER,
      { plan: "free", source: "stripe", expiresAt: new Date() },
      { customer: "cus_9" },
    );
    const info = await planFor(t.pool, USER);
    expect(info).toMatchObject({ plan: "pro", source: "app_store" });
    const row = await t.pool.query(
      "select stripe_customer_id from subscriptions where user_id = $1",
      [USER],
    );
    expect(row.rows[0]?.stripe_customer_id).toBe("cus_9");
    await applySubscription(t.pool, USER, {
      plan: "free",
      source: "app_store",
      expiresAt: new Date(),
    });
    expect((await planFor(t.pool, USER)).plan).toBe("free");
  });
});
