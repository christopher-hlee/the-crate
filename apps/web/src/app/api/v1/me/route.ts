import { limitsFor } from "@app/core";
import { deleteAccount } from "@/server/account";
import { requireViewer } from "@/server/auth";
import { profileOf, ranksFor } from "@/server/community";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  const info = await planFor(pool, viewer.userId);
  const l = limitsFor(info.plan);
  const [profile, ranks] = await Promise.all([
    profileOf(pool, viewer.userId),
    ranksFor(pool, [viewer.userId]),
  ]);
  const rank = ranks.get(viewer.userId) ?? { level: 1, title: "Newcomer", points: 0 };
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
        maxFavorites: l.maxFavorites,
        maxSavedFilters: l.maxSavedFilters,
        notes: l.notes,
        maxNotes: l.maxNotes,
        crateExport: l.crateExport,
        createShared: l.createShared,
        proFilters: l.proFilters,
        tempoVotes: l.tempoVotes,
        youtubePlaylist: l.youtubePlaylist,
        comments: l.comments,
      },
      profile,
      rank,
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
