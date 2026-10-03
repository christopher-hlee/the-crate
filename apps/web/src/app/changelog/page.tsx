import type { Metadata } from "next";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Changelog" };
export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  const res = await db().query<{
    id: string;
    kind: string;
    title: string;
    body: string;
    published_at: Date;
  }>(
    `select id, kind, title, body, published_at from changelog_entries
      where not draft and published_at is not null order by published_at desc limit 100`,
  );
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Changelog</h1>
        <p className="text-sm text-ink-2">
          Monthly catalog updates from the Discogs data dump, and app releases.
        </p>
      </div>
      {res.rows.length === 0 && <p className="text-ink-2">Nothing published yet.</p>}
      {res.rows.map((e) => (
        <article key={e.id} className="space-y-2 border-t border-line pt-4">
          <p className="text-xs uppercase tracking-wider text-ink-2">
            {e.kind === "data" ? "Catalog" : "App"} ·{" "}
            {e.published_at.toLocaleDateString("en-US", { dateStyle: "long" })}
          </p>
          <h2 className="text-lg font-semibold">{e.title}</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{e.body}</div>
        </article>
      ))}
    </div>
  );
}
