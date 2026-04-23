import crypto from "node:crypto";

type BuildDedupeKeysArgs = {
  sourceName: string;
  canonicalUrl: string;
  title: string;
  publishedAt: Date | null;
};

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
    parsed.searchParams.delete(key);
  });
  return parsed.toString();
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildDedupeKeys({
  sourceName,
  canonicalUrl,
  title,
  publishedAt,
}: BuildDedupeKeysArgs): { canonicalUrl: string; urlHash: string; signature: string } {
  const normalizedUrl = normalizeUrl(canonicalUrl);
  const signature = [
    normalizeText(sourceName),
    normalizeText(title),
    publishedAt?.toISOString() ?? "unknown-date",
  ].join("|");

  return {
    canonicalUrl: normalizedUrl,
    urlHash: crypto.createHash("sha256").update(normalizedUrl).digest("hex"),
    signature,
  };
}

export function shouldFetchFullText(
  rssContent: string | null | undefined,
  fetchFullTextWhenMissing: boolean,
  minFullTextLength: number,
): boolean {
  if (!fetchFullTextWhenMissing) {
    return false;
  }

  return (rssContent?.trim().length ?? 0) < minFullTextLength;
}
