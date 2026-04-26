import type { MetadataRoute } from "next";

import { getSiteOrigin, getSiteUrl } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/daily", "/api/feed/rss", "/api/daily/rss"],
        disallow: [
          "/admin",
          "/admin/",
          "/login",
          "/api/admin/",
          "/api/ingest/",
        ],
      },
    ],
    sitemap: getSiteUrl("/sitemap.xml"),
    host: getSiteOrigin(),
  };
}
