import crypto from "node:crypto";

type BuildDedupeKeysArgs = {
  canonicalUrl: string;
};

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
    parsed.searchParams.delete(key);
  });
  return parsed.toString();
}

export function buildDedupeKeys({
  canonicalUrl,
}: BuildDedupeKeysArgs): { canonicalUrl: string; urlHash: string } {
  const normalizedUrl = normalizeUrl(canonicalUrl);

  return {
    canonicalUrl: normalizedUrl,
    urlHash: crypto.createHash("sha256").update(normalizedUrl).digest("hex"),
  };
}

export function shouldFetchFullText(
  rssContent: string | null | undefined,
  minFullTextLength: number,
): boolean {
  return (rssContent?.trim().length ?? 0) < minFullTextLength;
}
