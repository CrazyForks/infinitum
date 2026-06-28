"use client";

import type { FeedGroupOption } from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";
import { formatGroupOptionLabel } from "@/components/feed/feed-panel.utils";

export function GroupFilterSidebar({
  groups,
  totalCount,
  selectedGroupId,
  onSelect,
}: {
  groups: FeedGroupOption[];
  totalCount: number;
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
}) {
  const optionClassName =
    "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)]";

  return (
    <aside
      role="complementary"
      aria-label="分组筛选侧栏"
      className="w-full lg:h-full"
    >
      <div className="panel-raised rounded-sm border border-[color:var(--line)] p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="mb-4">
          <h2 className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <span>分组筛选</span>
          </h2>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            aria-pressed={selectedGroupId === null}
            aria-label={formatGroupOptionLabel("全部内容", totalCount)}
            onClick={() => onSelect("")}
            className={cx(
              optionClassName,
              selectedGroupId === null
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "text-[var(--text-2)] hover:bg-[var(--bg-muted)]",
            )}
          >
            <span>{formatGroupOptionLabel("全部内容", totalCount)}</span>
          </button>

          {groups.map((group) => {
            const isActive = selectedGroupId === group.id;

            return (
              <button
                key={group.id}
                type="button"
                aria-pressed={isActive}
                aria-label={formatGroupOptionLabel(group.name, group.count)}
                onClick={() => onSelect(group.id)}
                className={cx(
                  optionClassName,
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                    : "text-[var(--text-2)] hover:bg-[var(--bg-muted)]",
                )}
              >
                <span>{formatGroupOptionLabel(group.name, group.count)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
