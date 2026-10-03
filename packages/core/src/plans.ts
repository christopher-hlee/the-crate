// Plan limits: the one config file for Free and Pro (docs/SPEC.md, "Product scope").

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanLimits = {
  /** Plays kept in history. */
  historyWindow: number;
  /** null means unlimited. */
  maxCrates: number | null;
  maxItemsPerCrate: number | null;
  notes: boolean;
  crateExport: boolean;
  /** Create share links, seeded crates and the like. Everyone can play them. */
  createShared: boolean;
  proFilters: boolean;
  tempoVotes: boolean;
  clearedDownload: boolean;
  ads: boolean;
};

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: {
    historyWindow: 50,
    maxCrates: 3,
    maxItemsPerCrate: 50,
    notes: false,
    crateExport: false,
    createShared: false,
    proFilters: false,
    tempoVotes: false,
    clearedDownload: false,
    ads: true,
  },
  pro: {
    historyWindow: 1000,
    maxCrates: null,
    maxItemsPerCrate: null,
    notes: true,
    crateExport: true,
    createShared: true,
    proFilters: true,
    tempoVotes: true,
    clearedDownload: true,
    ads: false,
  },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canCreateCrate(plan: Plan, existingCrates: number): boolean {
  const max = PLAN_LIMITS[plan].maxCrates;
  return max === null || existingCrates < max;
}

export function canAddCrateItems(plan: Plan, existingItems: number, adding = 1): boolean {
  const max = PLAN_LIMITS[plan].maxItemsPerCrate;
  return max === null || existingItems + adding <= max;
}

/** Pro is active when the plan is pro and it has not expired. */
export function effectivePlan(
  row: { plan: string; expiresAt: Date | null } | null | undefined,
  now: Date,
): Plan {
  if (row?.plan !== "pro") return "free";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "free";
  return "pro";
}

export type BillingSource = "stripe" | "app_store" | "play_store";
export type SubscriptionState = {
  plan: Plan;
  source: BillingSource | null;
  expiresAt: Date | null;
};

/**
 * Merges a billing event into the stored subscription. One `pro` entitlement is shared by the
 * web (Stripe) and the stores (RevenueCat): an event from one source never cuts short an
 * active Pro from another source that runs longer.
 */
export function mergeSubscription(
  current: SubscriptionState | null,
  incoming: SubscriptionState,
  now: Date,
): SubscriptionState {
  if (!current || current.source === incoming.source || current.source === null) return incoming;
  const currentActive =
    effectivePlan({ plan: current.plan, expiresAt: current.expiresAt }, now) === "pro";
  if (!currentActive) return incoming;
  const incomingActive =
    effectivePlan({ plan: incoming.plan, expiresAt: incoming.expiresAt }, now) === "pro";
  if (!incomingActive) return current;
  // Both active: keep whichever runs longer (no expiry means it renews indefinitely).
  const end = (s: SubscriptionState) => s.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return end(incoming) >= end(current) ? incoming : current;
}
