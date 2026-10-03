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
