const LINK_REL_TOKENS = "noopener noreferrer nofollow";

type RenderSafeMarkdownOptions = {
  headingIdPrefix?: string;
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

function renderInline(markdown: string) {
  const escaped = escapeHtml(markdown);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
      if (!isSafeUrl(href)) {
        return label;
      }
      const safeHref = escapeHtml(href);
      return `<a href="${safeHref}" target="_blank" rel="${LINK_REL_TOKENS}">${label}</a>`;
    });
}

function flushParagraph(lines: string[], html: string[]) {
  if (lines.length === 0) return;
  html.push(`<p>${renderInline(lines.join("\n"))}</p>`);
  lines.length = 0;
}

function flushList(lines: string[], html: string[]) {
  if (lines.length === 0) return;
  html.push("<ul>", ...lines.map((line) => `<li>${renderInline(line)}</li>`), "</ul>");
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

export function renderSafeMarkdown(markdown: string, options: RenderSafeMarkdownOptions = {}) {
  const html: string[] = [];
  const paragraphLines: string[] = [];
  const listLines: string[] = [];
  const blockquoteLines: string[] = [];
  let headingIndex = 0;

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph(paragraphLines, html);
      flushList(listLines, html);
      flushBlockquote(blockquoteLines, html);
      continue;
    }

    const blockquote = /^>\s?(.+)$/.exec(line);
    if (blockquote) {
      flushParagraph(paragraphLines, html);
      flushList(listLines, html);
      blockquoteLines.push(blockquote[1]);
      continue;
    }

    if (isLabelLine(line)) {
      flushParagraph(paragraphLines, html);
      flushList(listLines, html);
      flushBlockquote(blockquoteLines, html);
      html.push(`<p>${renderInline(line)}</p>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(paragraphLines, html);
      flushList(listLines, html);
      flushBlockquote(blockquoteLines, html);
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

    flushList(listLines, html);
    flushBlockquote(blockquoteLines, html);
    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, html);
  flushList(listLines, html);
  flushBlockquote(blockquoteLines, html);

  return html.join("\n");
}
