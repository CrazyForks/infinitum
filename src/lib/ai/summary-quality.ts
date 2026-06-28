const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITY_PATTERN = /&nbsp;|&#160;/gi;
const MULTI_SPACE_PATTERN = /\s+/g;
const SUMMARY_SOURCE_EQUIVALENCE_PATTERN = /[\s\p{P}\p{S}]+/gu;

export const MAX_ITEM_SUMMARY_CHARS = 800;

export function normalizeSummaryCandidate(value: string | null | undefined): string {
  return (value ?? "")
    .replace(HTML_TAG_PATTERN, " ")
    .replace(HTML_ENTITY_PATTERN, " ")
    .replace(MULTI_SPACE_PATTERN, " ")
    .trim();
}

function normalizeForSourceComparison(value: string) {
  return normalizeSummaryCandidate(value)
    .replace(SUMMARY_SOURCE_EQUIVALENCE_PATTERN, "")
    .toLowerCase();
}

function getSummaryQualityIssue(summary: string, sourceText: string | null | undefined): string | null {
  if (!summary) {
    return "empty summary";
  }

  if (summary.length > MAX_ITEM_SUMMARY_CHARS) {
    return "summary is too long";
  }

  const normalizedSummary = normalizeForSourceComparison(summary);
  const normalizedSource = normalizeForSourceComparison(sourceText ?? "");

  if (!normalizedSource || !normalizedSummary) {
    return null;
  }

  if (normalizedSummary === normalizedSource) {
    return "summary matches source text";
  }

  if (summary.length >= 500 && summary.length > normalizeSummaryCandidate(sourceText).length * 0.6) {
    return "summary resembles source text";
  }

  return null;
}

export function requireUsableGeneratedSummary(
  value: string | null | undefined,
  sourceText: string | null | undefined,
): string {
  const summary = normalizeSummaryCandidate(value);
  const issue = getSummaryQualityIssue(summary, sourceText);

  if (issue) {
    throw new Error(`Invalid item summary response: ${issue}.`);
  }

  return summary;
}

export function normalizeStoredSummary(value: string | null | undefined): string | null {
  const summary = normalizeSummaryCandidate(value);

  if (!summary || summary.length > MAX_ITEM_SUMMARY_CHARS) {
    return null;
  }

  return summary;
}
