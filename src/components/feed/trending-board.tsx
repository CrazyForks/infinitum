"use client";

import type { TrendingEntryDTO } from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";
import { IconFlame } from "@/components/ui/icons";

function buildEntryHref(entry: TrendingEntryDTO): string {
  const params = new URLSearchParams({
    entryId: entry.id,
    entryType: entry.type,
  });
  return `/?${params.toString()}`;
}

export function TrendingBoard({
  entries,
  onShowAll,
}: {
  entries: TrendingEntryDTO[];
  onShowAll: () => void;
}) {
  if (entries.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="实时榜单"
      className="mt-4 border-t border-[color:var(--line)] pt-3 text-left"
    >
      <div className="mb-2">
        <h2 className="flex w-full items-center justify-between gap-2 font-semibold text-[var(--foreground)]">
          <span className="inline-flex items-center gap-2">
            <IconFlame size={14} strokeWidth={2.2} className="text-[#f97316]" />
            <span>实时榜单</span>
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="shrink-0 rounded-sm px-1 text-xs font-medium text-[var(--accent-strong)] transition hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)]"
          >
            查看全部
          </button>
        </h2>
      </div>
      <ol className="space-y-1">
        {entries.map((entry, index) => {
          const rank = index + 1;

          return (
            <li key={entry.id}>
              <a
                href={buildEntryHref(entry)}
                title={entry.title}
                className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-1 rounded-sm px-2 py-0.5 -mx-2 text-[var(--text-2)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)]"
              >
                <span
                  aria-hidden
                  className={cx(
                    "mt-px text-right font-mono tabular-nums leading-none",
                    rank === 1 && "text-[15px] font-bold text-[#d97706]",
                    rank === 2 && "text-[15px] font-bold text-[#2563eb]",
                    rank === 3 && "text-[15px] font-bold text-[#16a34a]",
                    rank > 3 && "text-[15px] text-[var(--text-3)]",
                  )}
                >
                  {rank}
                </span>
                <span className="line-clamp-2 min-w-0 text-justify text-sm leading-5 [text-align-last:left]">
                  {entry.title}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
