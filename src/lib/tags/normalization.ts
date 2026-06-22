export type NormalizedTag = {
  name: string;
  normalized: string;
};

const MAX_TAGS_PER_ITEM = 5;
const MAX_TAG_LENGTH = 40;
const GENERIC_TAGS = new Set([
  "新闻",
  "资讯",
  "文章",
  "更新",
  "动态",
  "科技",
  "技术",
  "互联网",
  "news",
  "article",
  "update",
  "updates",
  "technology",
  "tech",
]);

function stripEdgePunctuation(value: string) {
  return value
    .replace(/^[\s#＃"'“”‘’`.,，。:：;；!?！？、()[\]{}【】<>《》]+/u, "")
    .replace(/[\s#＃"'“”‘’`.,，。:：;；!?！？、()[\]{}【】<>《》]+$/u, "");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTagKey(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase();
}

export function normalizeTagName(input: string): NormalizedTag | null {
  const name = normalizeWhitespace(stripEdgePunctuation(input));

  if (!name || name.length > MAX_TAG_LENGTH) {
    return null;
  }

  const normalized = normalizeTagKey(name);

  if (!normalized || GENERIC_TAGS.has(normalized)) {
    return null;
  }

  return { name, normalized };
}

export function normalizeItemTags(input: unknown): NormalizedTag[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const tags: NormalizedTag[] = [];

  for (const rawTag of input) {
    if (typeof rawTag !== "string") {
      continue;
    }

    const tag = normalizeTagName(rawTag);
    if (!tag || seen.has(tag.normalized)) {
      continue;
    }

    seen.add(tag.normalized);
    tags.push(tag);

    if (tags.length >= MAX_TAGS_PER_ITEM) {
      break;
    }
  }

  return tags;
}
