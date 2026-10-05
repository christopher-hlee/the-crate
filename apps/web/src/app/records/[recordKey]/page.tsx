import { formatDuration, isRecordKey } from "@app/core";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CommentsPanel } from "@/components/CommentsPanel";
import { RecordVideos } from "@/components/RecordVideos";
import { Sleeve } from "@/components/Sleeve";
import { Badge } from "@/components/ui/badge";
import { db } from "@/server/db";
import { getRecord } from "@/server/records";

type Props = { params: Promise<{ recordKey: string }>; searchParams: Promise<{ v?: string }> };

// One query per request: generateMetadata and the page share it.
const recordFor = cache(async (key: string) => getRecord(db(), key));

async function load(params: Props["params"]) {
  const key = decodeURIComponent((await params).recordKey);
  if (!isRecordKey(key)) notFound();
  const record = await recordFor(key);
  if (!record) notFound();
  return record;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  return {
    title: `${r.artist} – ${r.title}${r.year ? ` (${r.year})` : ""}`,
    description: [r.labels[0]?.name, r.year, r.country, r.styles.join(", ")]
      .filter(Boolean)
      .join(" · "),
  };
}

export default async function RecordPage({ params, searchParams }: Props) {
  const r = await load(params);
  const { v } = await searchParams;
  const label = r.labels[0];
  return (
    <div className="space-y-6">
      <RecordVideos record={r} initialVideo={v} />
      <article className="flex flex-col gap-6 sm:flex-row">
        <Sleeve
          label={label?.name}
          catno={label?.catno}
          year={r.year}
          styles={r.styles}
          size={180}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <header>
            <p className="text-ink-2">{r.artist}</p>
            <h1 className="text-2xl font-semibold">{r.title}</h1>
            <p className="text-sm text-ink-2">
              {[
                label && `${label.name}${label.catno ? ` · ${label.catno}` : ""}`,
                r.year,
                r.country,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>
          <div className="flex flex-wrap gap-1.5">
            {[...r.genres, ...r.styles].map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
          <p className="text-sm text-ink-2">
            {r.formats.map((f) => [f.name, ...f.descriptions].join(", ")).join(" · ")} ·{" "}
            {r.pressings} pressing
            {r.pressings === 1 ? "" : "s"} on Discogs
          </p>
          {r.tracklist.length > 0 && (
            <ol className="divide-y divide-line rounded-md border border-line text-sm">
              {r.tracklist.map((t, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positions repeat or are empty on headings
                <li key={`${t.position}-${i}`} className="flex gap-3 px-3 py-1.5">
                  <span className="w-10 shrink-0 tabular-nums text-ink-2">{t.position}</span>
                  <span className="flex-1">{t.title}</span>
                  {t.durationS !== null && (
                    <span className="tabular-nums text-ink-2">{formatDuration(t.durationS)}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <a
            href={r.discogsUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-accent underline"
          >
            View on Discogs <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      </article>
      <CommentsPanel recordKey={r.recordKey} />
    </div>
  );
}
