const LEADING_THINK_BLOCK_PATTERN = /^(?:\s*<think>[\s\S]*?<\/think>\s*)+/i;

export function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function stripLeadingThinking(value: string) {
  return value.replace(LEADING_THINK_BLOCK_PATTERN, "").trim();
}

export function normalizeModelResponseText(value: string | null | undefined) {
  return stripCodeFence(stripLeadingThinking(stripCodeFence(value ?? "")));
}
