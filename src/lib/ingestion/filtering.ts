type FindBlacklistMatchArgs = {
  title: string | null | undefined;
  content: string | null | undefined;
  blacklist: string[];
};

type EvaluateRuleFilterArgs = FindBlacklistMatchArgs & {
  url?: string | null | undefined;
  sourceName?: string | null | undefined;
};

export type RuleFilterMatch = {
  rule: "blacklist" | "title_pattern" | "url_pattern" | "content_quality";
  label: string;
  detail: string;
  score: number;
};

export type RuleFilterResult = {
  filtered: boolean;
  score: number;
  threshold: number;
  reason: string | null;
  detail: string | null;
  matches: RuleFilterMatch[];
};

const FILTER_THRESHOLD = 50;
const STARTING_SCORE = 100;
const MIN_MEANINGFUL_TEXT_LENGTH = 120;
const BLACKLIST_PENALTY = 100;
const TITLE_PATTERN_PENALTY = 45;
const URL_PATTERN_PENALTY = 35;
const SHORT_CONTENT_PENALTY = 25;
const TEMPLATE_CONTENT_PENALTY = 20;

const TITLE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(sponsored|advertorial|partner content|promoted)\b/i, label: "sponsored" },
  { pattern: /\b(webinar|coupon|deal alert|giveaway)\b/i, label: "marketing" },
  { pattern: /\b(weekly roundup|daily roundup|newsletter|digest)\b/i, label: "roundup" },
];

const URL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/(sponsored|advertorial|promo|promoted)(\/|$)/i, label: "sponsored_path" },
  { pattern: /\/(webinar|events?|newsletter|deals?)(\/|$)/i, label: "low_signal_path" },
  { pattern: /[?&](utm_campaign|coupon|promo)=/i, label: "campaign_url" },
];

const TEMPLATE_PHRASES = [
  "all rights reserved",
  "subscribe to our newsletter",
  "sign up for our newsletter",
  "this press release",
  "forward-looking statements",
  "safe harbor statement",
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pushMatch(matches: RuleFilterMatch[], match: RuleFilterMatch) {
  if (!matches.some((current) => current.rule === match.rule && current.label === match.label)) {
    matches.push(match);
  }
}

export function evaluateRuleFilter({
  title,
  content,
  url,
  blacklist,
}: EvaluateRuleFilterArgs): RuleFilterResult {
  const normalizedTitle = normalizeText(title);
  const normalizedContent = normalizeText(content);
  const haystack = `${normalizedTitle}\n${normalizedContent}`.toLowerCase();
  const matches: RuleFilterMatch[] = [];

  for (const keyword of blacklist) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized && haystack.includes(normalized)) {
      pushMatch(matches, {
        rule: "blacklist",
        label: keyword,
        detail: `Matched blacklist keyword: ${keyword}`,
        score: -BLACKLIST_PENALTY,
      });
    }
  }

  for (const { pattern, label } of TITLE_PATTERNS) {
    if (pattern.test(normalizedTitle)) {
      pushMatch(matches, {
        rule: "title_pattern",
        label,
        detail: `Matched low-signal title pattern: ${label}`,
        score: -TITLE_PATTERN_PENALTY,
      });
    }
  }

  if (url) {
    for (const { pattern, label } of URL_PATTERNS) {
      if (pattern.test(url)) {
        pushMatch(matches, {
          rule: "url_pattern",
          label,
          detail: `Matched low-signal URL pattern: ${label}`,
          score: -URL_PATTERN_PENALTY,
        });
      }
    }
  }

  const meaningfulLength = `${normalizedTitle} ${normalizedContent}`.trim().length;
  if (meaningfulLength > 0 && meaningfulLength < MIN_MEANINGFUL_TEXT_LENGTH) {
    pushMatch(matches, {
      rule: "content_quality",
      label: "too_short",
      detail: `Content is too short for reliable analysis: ${meaningfulLength} chars`,
      score: -SHORT_CONTENT_PENALTY,
    });
  }

  const templatePhraseCount = TEMPLATE_PHRASES.filter((phrase) => haystack.includes(phrase)).length;
  if (templatePhraseCount >= 2) {
    pushMatch(matches, {
      rule: "content_quality",
      label: "template_phrases",
      detail: `Matched ${templatePhraseCount} boilerplate/template phrases`,
      score: -TEMPLATE_CONTENT_PENALTY,
    });
  }

  const score = Math.max(0, STARTING_SCORE + matches.reduce((sum, match) => sum + match.score, 0));
  const filtered = matches.some((match) => match.rule === "blacklist") || score < FILTER_THRESHOLD;

  return {
    filtered,
    score,
    threshold: FILTER_THRESHOLD,
    reason: matches[0]?.label ?? null,
    detail: matches.length > 0
      ? `Rule score ${score}/${STARTING_SCORE} (threshold ${FILTER_THRESHOLD}): ${matches.map((match) => match.detail).join("; ")}`
      : null,
    matches,
  };
}

export function findBlacklistMatch({
  title,
  content,
  blacklist,
}: FindBlacklistMatchArgs): string | null {
  return evaluateRuleFilter({ title, content, blacklist }).matches.find((match) => match.rule === "blacklist")?.label ?? null;
}
