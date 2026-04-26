import type { Metadata } from "next";

import { resolveSiteOrigin } from "@/lib/http/public-origin";

export const SITE_NAME = "Infinitum";
export const SITE_DEFAULT_TITLE = "Infinitum 资讯聚合";
export const SITE_DEFAULT_DESCRIPTION = "Infinitum 聚合、分析与整理来自多个来源的技术资讯，提供高密度信息流、主题聚类和 AI 日报。";

export const SEO_KEYWORDS = [
  "Infinitum",
  "资讯聚合",
  "技术资讯",
  "AI 日报",
  "RSS 聚合",
  "内容聚类",
];

export const PUBLIC_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export const PRIVATE_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

export function getSiteOrigin() {
  return resolveSiteOrigin();
}

export function getSiteUrl(path = "/") {
  return new URL(path, getSiteOrigin()).toString();
}

export function getMetadataBase() {
  return new URL(getSiteOrigin());
}

export function stripInlineMarkdown(value: string) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSeoDescription(value: string | null | undefined, fallback = SITE_DEFAULT_DESCRIPTION, maxLength = 160) {
  const normalized = stripInlineMarkdown(value ?? "");
  const source = normalized || fallback;

  if (source.length <= maxLength) {
    return source;
  }

  return `${source.slice(0, maxLength - 1).trimEnd()}…`;
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function buildWebSiteJsonLd() {
  const origin = getSiteOrigin();

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: origin,
    inLanguage: "zh-CN",
    description: SITE_DEFAULT_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/?title={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
