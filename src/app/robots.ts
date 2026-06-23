import type { MetadataRoute } from "next";

import { getSiteOrigin, getSiteUrl } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/daily",
          "/llms.txt",
          "/llms-full.txt",
          "/api/feed/rss",
          "/api/daily/rss",
        ],
        disallow: [
          "/admin",
          "/admin/",
          "/login",
          "/api/admin/",
          "/api/ingest/",
        ],
      },
    ],
    sitemap: [getSiteUrl("/sitemap.xml"), getSiteUrl("/sitemap-news.xml")],
    host: origin,
  };
}
