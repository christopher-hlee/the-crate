import { db } from "@/server/db";
import { json, route } from "@/server/http";

export const GET = route(async () => {
  const res = await db().query<{
    id: string;
    kind: "data" | "app";
    title: string;
    body: string;
    published_at: Date;
  }>(
    `select id, kind, title, body, published_at from changelog_entries
      where not draft and published_at is not null order by published_at desc limit 100`,
  );
  return json(
    {
      entries: res.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        publishedAt: r.published_at.toISOString(),
      })),
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
  );
});
