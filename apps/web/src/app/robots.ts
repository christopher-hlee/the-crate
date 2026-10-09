import type { MetadataRoute } from "next";
import { robotsFile } from "@/server/seo";

// Lists every sitemap file, so it follows the catalog like the sitemaps do.
export const dynamic = "force-dynamic";

export default function robots(): Promise<MetadataRoute.Robots> {
  return robotsFile();
}
