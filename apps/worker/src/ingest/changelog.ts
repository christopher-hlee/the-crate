// Drafts the monthly data changelog entry. The owner reviews and publishes drafts.

import type { Census } from "@app/db";

const fmt = (n: number) => n.toLocaleString("en-US");

export function draftDataChangelog(input: {
  dumpDate: string;
  records: number;
  recordVideos: number;
  addedRecords: number;
  removedRecords: number;
  newVideoIds: number;
  census: Census;
}): { title: string; body: string } {
  const d = new Date(`${input.dumpDate}T00:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const long = d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const top = Object.entries(input.census.styles)
    .slice(0, 5)
    .map(([s, e]) => `${s} (${fmt(e.records)})`)
    .join(", ");
  const lines = [
    `The ${long} Discogs data dump is in. The catalog now holds ${fmt(input.records)} records with ${fmt(input.recordVideos)} YouTube links.`,
    "",
    `- ${fmt(input.addedRecords)} records added and ${fmt(input.removedRecords)} removed since the last update.`,
    `- ${fmt(input.newVideoIds)} new YouTube links are waiting for validation and join the shuffle once checked.`,
  ];
  if (top) lines.push(`- Most-linked styles: ${top}.`);
  return { title: `Catalog update: ${month}`, body: lines.join("\n") };
}
