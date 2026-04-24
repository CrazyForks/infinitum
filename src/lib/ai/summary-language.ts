const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITY_PATTERN = /&nbsp;|&#160;/gi;
const MULTI_SPACE_PATTERN = /\s+/g;
const CJK_GLOBAL_PATTERN = /[\u3400-\u9FFF]/g;
const ENGLISH_WORD_PATTERN = /\b[A-Za-z]{3,}\b/g;

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

  if (cjkCount >= 4) {
    return false;
  }

  const englishWordCount = text.match(ENGLISH_WORD_PATTERN)?.length ?? 0;
  return englishWordCount >= 3;
}
