const separatorPattern = /[\s\p{P}\p{S}_]+/gu;
const cjkPattern = /[\u3400-\u9fff\uf900-\ufaff]/u;

export function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function compactSearchText(value: string | null | undefined) {
  return normalizeSearchText(value).replace(separatorPattern, "");
}

function getSearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }

  const terms = normalized.split(separatorPattern).filter(Boolean);
  return terms.length > 0 ? terms : [normalized];
}

export function getDatabaseSearchTerms(query: string | null | undefined) {
  return getSearchTerms(query ?? "").flatMap((term) => {
    const chars = Array.from(term);
    if (!chars.some((char) => cjkPattern.test(char))) {
      return [term];
    }

    const segments: string[] = [];
    let latinSegment = "";

    for (const char of chars) {
      if (cjkPattern.test(char)) {
        if (latinSegment) {
          segments.push(latinSegment);
          latinSegment = "";
        }
        segments.push(char);
      } else {
        latinSegment += char;
      }
    }

    if (latinSegment) {
      segments.push(latinSegment);
    }

    return segments.filter(Boolean);
  });
}

function isSubsequence(needle: string, haystack: string) {
  if (!needle) {
    return true;
  }

  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) {
      cursor += 1;
      if (cursor === needle.length) {
        return true;
      }
    }
  }

  return false;
}

function matchesTerm(term: string, normalizedCorpus: string, compactCorpus: string) {
  const compactTerm = compactSearchText(term);
  if (!compactTerm) {
    return true;
  }

  if (normalizedCorpus.includes(term) || compactCorpus.includes(compactTerm)) {
    return true;
  }

  return cjkPattern.test(compactTerm) && compactTerm.length >= 2 && isSubsequence(compactTerm, compactCorpus);
}

export function matchesFuzzySearch(query: string | null | undefined, values: Array<string | null | undefined>) {
  const terms = getSearchTerms(query ?? "");
  if (terms.length === 0) {
    return true;
  }

  const corpus = values.filter(Boolean).join("\n");
  const normalizedCorpus = normalizeSearchText(corpus);
  const compactCorpus = compactSearchText(corpus);

  return terms.every((term) => matchesTerm(term, normalizedCorpus, compactCorpus));
}
