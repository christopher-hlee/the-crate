import { limitsFor } from "@app/core";
import { deleteAccount } from "@/server/account";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const info = await planFor(db(), viewer.userId);
  const l = limitsFor(info.plan);
  return json(
    {
      user: { id: viewer.userId, email: viewer.email },
      plan: info.plan,
      planSource: info.source,
      expiresAt: info.expiresAt?.toISOString() ?? null,
      limits: {
        maxCrates: l.maxCrates,
        maxItemsPerCrate: l.maxItemsPerCrate,
        historyWindow: l.historyWindow,
        notes: l.notes,
        crateExport: l.crateExport,
        createShared: l.createShared,
        proFilters: l.proFilters,
        tempoVotes: l.tempoVotes,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
});

/** Deletes the account and every row the user owns (rule 15: within 7 days; here, at once). */
export const DELETE = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  await deleteAccount(pool, viewer.userId);
  return json({ deleted: true });
});
