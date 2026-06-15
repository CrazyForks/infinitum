const LINK_REL_TOKENS = "noopener noreferrer nofollow";

type RenderSafeMarkdownOptions = {
  headingIdPrefix?: string;
  collapsibleSourceLists?: boolean;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] ?? char;
  });
}

function isSafeUrl(value: string) {
  try {
    const url = new URL(value, "https://example.com");
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function renderBasicInline(markdown: string) {
  const escaped = escapeHtml(markdown);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\\([!"#$%&'()*+,\-./:;=?@[\\\]^_`{|}~])/g, "$1");
}

function findLinkLabelEnd(markdown: string, start: number) {
  let depth = 1;
  for (let index = start + 1; index < markdown.length; index += 1) {
    const char = markdown[index];
    if (char === "\\" && index + 1 < markdown.length) {
      index += 1;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function findLinkHrefEnd(markdown: string, start: number) {
  let depth = 0;
  for (let index = start; index < markdown.length; index += 1) {
    const char = markdown[index];
    if (char === "\\" && index + 1 < markdown.length) {
      index += 1;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

function parseInlineLink(markdown: string, start: number) {
  const labelEnd = findLinkLabelEnd(markdown, start);
  if (labelEnd < 0 || markdown[labelEnd + 1] !== "(") {
    return null;
  }

  const hrefStart = labelEnd + 2;
  const hrefEnd = findLinkHrefEnd(markdown, hrefStart);
  if (hrefEnd < 0) {
    return null;
  }

  return {
    end: hrefEnd,
    href: markdown.slice(hrefStart, hrefEnd).trim(),
    label: markdown.slice(start + 1, labelEnd),
  };
}

function renderInline(markdown: string) {
  let html = "";
  let cursor = 0;

  while (cursor < markdown.length) {
    const linkStart = markdown.indexOf("[", cursor);
    if (linkStart < 0) {
      html += renderBasicInline(markdown.slice(cursor));
      break;
    }

    const link = parseInlineLink(markdown, linkStart);
    if (!link) {
      html += renderBasicInline(markdown.slice(cursor, linkStart + 1));
      cursor = linkStart + 1;
      continue;
    }

    html += renderBasicInline(markdown.slice(cursor, linkStart));
    if (link.href && !/\s/.test(link.href) && isSafeUrl(link.href)) {
      html += `<a href="${escapeHtml(link.href)}" target="_blank" rel="${LINK_REL_TOKENS}">${renderBasicInline(link.label)}</a>`;
    } else {
      html += renderBasicInline(link.label);
    }
    cursor = link.end + 1;
  }

  return html;
}

function flushParagraph(lines: string[], html: string[]) {
  if (lines.length === 0) return;
  html.push(`<p>${renderInline(lines.join("\n"))}</p>`);
  lines.length = 0;
}

function flushList(lines: string[], html: string[], collapsibleLabelHtml?: string | null) {
  if (lines.length === 0) return;
  const itemHtml = lines.map((line) => `<li>${renderInline(line)}</li>`);
  if (collapsibleLabelHtml) {
    const count = lines.length;
    html.push(
      `<details class="daily-report-source-list">`,
      `<summary><span class="daily-report-source-label">${collapsibleLabelHtml}</span><span class="daily-report-source-state"><span class="daily-report-source-state-closed">展开 ${count} 条</span><span class="daily-report-source-state-open">收起 ${count} 条</span></span></summary>`,
      "<ul>",
      ...itemHtml,
      "</ul>",
      "</details>",
    );
  } else {
    html.push("<ul>", ...itemHtml, "</ul>");
  }
  lines.length = 0;
}

function flushBlockquote(lines: string[], html: string[]) {
  if (lines.length === 0) return;
  html.push("<blockquote>", ...lines.map((line) => `<p>${renderInline(line)}</p>`), "</blockquote>");
  lines.length = 0;
}

function isLabelLine(line: string) {
  return /^(\*\*)?(重点|来源)：(\*\*)?/.test(line);
}

function isSourceLabelLine(line: string) {
  return /^(\*\*)?来源：(\*\*)?/.test(line);
}

export function renderSafeMarkdown(markdown: string, options: RenderSafeMarkdownOptions = {}) {
  const html: string[] = [];
  const paragraphLines: string[] = [];
  const listLines: string[] = [];
  const blockquoteLines: string[] = [];
  let pendingCollapsibleSourceLabelHtml: string | null = null;
  let headingIndex = 0;

  const flushPendingSourceLabel = () => {
    if (!pendingCollapsibleSourceLabelHtml) return;
    html.push(`<p>${pendingCollapsibleSourceLabelHtml}</p>`);
    pendingCollapsibleSourceLabelHtml = null;
  };

  const flushCurrentList = () => {
    if (listLines.length === 0) return;
    flushList(listLines, html, pendingCollapsibleSourceLabelHtml);
    pendingCollapsibleSourceLabelHtml = null;
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph(paragraphLines, html);
      flushCurrentList();
      flushBlockquote(blockquoteLines, html);
      continue;
    }

    const blockquote = /^>\s?(.+)$/.exec(line);
    if (blockquote) {
      flushParagraph(paragraphLines, html);
      flushCurrentList();
      flushPendingSourceLabel();
      blockquoteLines.push(blockquote[1]);
      continue;
    }

    if (isLabelLine(line)) {
      flushParagraph(paragraphLines, html);
      flushCurrentList();
      flushBlockquote(blockquoteLines, html);
      flushPendingSourceLabel();
      if (options.collapsibleSourceLists && isSourceLabelLine(line)) {
        pendingCollapsibleSourceLabelHtml = renderInline(line);
        continue;
      }
      html.push(`<p>${renderInline(line)}</p>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(paragraphLines, html);
      flushCurrentList();
      flushBlockquote(blockquoteLines, html);
      flushPendingSourceLabel();
      const level = Math.min(6, heading[1].length);
      const id = options.headingIdPrefix ? ` id="${options.headingIdPrefix}-${headingIndex}"` : "";
      headingIndex += 1;
      html.push(`<h${level}${id}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph(paragraphLines, html);
      flushBlockquote(blockquoteLines, html);
      listLines.push(listItem[1]);
      continue;
    }

    flushCurrentList();
    flushBlockquote(blockquoteLines, html);
    flushPendingSourceLabel();
    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, html);
  flushCurrentList();
  flushBlockquote(blockquoteLines, html);
  flushPendingSourceLabel();

  return html.join("\n");
}
