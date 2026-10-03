import "server-only";
import { effectivePlan, type Plan } from "@app/core";
import type { Queryable } from "@app/db";

export type PlanInfo = {
  plan: Plan;
  source: "stripe" | "app_store" | "play_store" | null;
  expiresAt: Date | null;
};

/** Pro gating happens here, on the server, from `subscriptions`. */
export async function planFor(db: Queryable, userId: string | null | undefined): Promise<PlanInfo> {
  if (!userId) return { plan: "free", source: null, expiresAt: null };
  const res = await db.query<{ plan: string; source: PlanInfo["source"]; expires_at: Date | null }>(
    "select plan, source, expires_at from subscriptions where user_id = $1",
    [userId],
  );
  const row = res.rows[0];
  const plan = effectivePlan(
    row ? { plan: row.plan, expiresAt: row.expires_at } : null,
    new Date(),
  );
  return { plan, source: row?.source ?? null, expiresAt: row?.expires_at ?? null };
}
