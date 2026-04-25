import type { ReactNode } from "react";

export function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const markdownPattern = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownPattern.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={`${start}-strong`} className="font-semibold text-[var(--foreground)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`${start}-em`} className="italic text-[var(--foreground)]">
          {token.slice(1, -1)}
        </em>,
      );
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
