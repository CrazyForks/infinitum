const ENGLISH_LETTER_PATTERN = /[A-Za-z]/g;
const CJK_PATTERN = /[\u3400-\u9FFF]/;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITY_PATTERN = /&nbsp;|&#160;/gi;
const MULTI_SPACE_PATTERN = /\s+/g;

export function stripHtmlTags(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replace(HTML_TAG_PATTERN, " ")
    .replace(HTML_ENTITY_PATTERN, " ")
    .replace(MULTI_SPACE_PATTERN, " ")
    .trim();
}

export function getDisplayTitle(originalTitle: string, translatedTitle: string | null): string {
  return translatedTitle?.trim() || originalTitle;
}

export function shouldTranslateTitle(title: string): boolean {
  const englishCharacters = title.match(ENGLISH_LETTER_PATTERN)?.length ?? 0;

  if (englishCharacters < 6) {
    return false;
  }

  return !CJK_PATTERN.test(title);
}

export function getDisplaySummary(
  summaryText: string | null,
  rssExcerpt: string | null,
  fallbackBody: string | null,
): string {
  return stripHtmlTags(summaryText) || stripHtmlTags(rssExcerpt) || stripHtmlTags(fallbackBody) || "暂无摘要";
}
