import type { MetadataRoute } from "next";
import { sitemapEntries, sitemapIds } from "@/server/seo";

// Served as /sitemap/<id>.xml, 50,000 URLs per file at most; robots.txt lists every file.
// Rendered per request (the file starts are cached in Postgres), so a build never needs the
// database and the list follows the monthly catalog.
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  return sitemapIds();
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  return Number.isSafeInteger(id) && id >= 0 ? sitemapEntries(id) : [];
}
