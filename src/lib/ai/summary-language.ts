const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITY_PATTERN = /&nbsp;|&#160;/gi;
const MULTI_SPACE_PATTERN = /\s+/g;
const CJK_GLOBAL_PATTERN = /[\u3400-\u9FFF]/g;
const ENGLISH_WORD_PATTERN = /\b[A-Za-z]{3,}\b/g;
const CANDIDATE_LABEL_PATTERN = /(^|\s)候选\s*\d+/;
const TITLE_LABEL_PATTERN = /(^|\s)标题[:：]/;
const SUMMARY_LABEL_PATTERN = /(^|\s)摘要[:：]/;

function normalizeSummaryText(value: string | null | undefined) {
  return (value ?? "")
    .replace(HTML_TAG_PATTERN, " ")
    .replace(HTML_ENTITY_PATTERN, " ")
    .replace(MULTI_SPACE_PATTERN, " ")
    .trim();
}

export function shouldRegenerateChineseSummary(value: string | null | undefined) {
  const text = normalizeSummaryText(value);

  if (!text) {
    return false;
  }

  const cjkCount = text.match(CJK_GLOBAL_PATTERN)?.length ?? 0;
  const englishWordCount = text.match(ENGLISH_WORD_PATTERN)?.length ?? 0;

  if (
    CANDIDATE_LABEL_PATTERN.test(text) &&
    TITLE_LABEL_PATTERN.test(text) &&
    SUMMARY_LABEL_PATTERN.test(text) &&
    englishWordCount >= 3
  ) {
    return true;
  }

  if (cjkCount >= 4) {
    return englishWordCount >= 20 && cjkCount < englishWordCount * 2;
  }

  return englishWordCount >= 3;
}

export async function retryChineseSummary<TMetadata>(
  summarize: (metadata: TMetadata) => Promise<string>,
  metadata: TMetadata,
) {
  const firstSummary = await summarize(metadata);

  if (!shouldRegenerateChineseSummary(firstSummary)) {
    return firstSummary;
  }

  const retrySummary = await summarize(metadata);

  if (shouldRegenerateChineseSummary(retrySummary)) {
    throw new Error("AI summary is not Chinese after retry.");
  }

  return retrySummary;
}
