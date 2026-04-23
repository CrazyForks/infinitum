type FindBlacklistMatchArgs = {
  title: string | null | undefined;
  content: string | null | undefined;
  blacklist: string[];
};

export function findBlacklistMatch({
  title,
  content,
  blacklist,
}: FindBlacklistMatchArgs): string | null {
  const haystack = `${title ?? ""}\n${content ?? ""}`.toLowerCase();

  for (const keyword of blacklist) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized && haystack.includes(normalized)) {
      return keyword;
    }
  }

  return null;
}
