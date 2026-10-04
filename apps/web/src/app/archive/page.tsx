import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveScreen } from "@/components/ArchiveScreen";
import { env } from "@/server/env";

// Unlisted and flagged: no nav link, no indexing, 404 unless FEATURE_CLEARED_LANE is on.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Archive (preview)",
  robots: { index: false, follow: false },
};

export default function ArchivePage() {
  if (!env().flags.FEATURE_CLEARED_LANE) notFound();
  return <ArchiveScreen />;
}
