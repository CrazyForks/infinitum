import type { ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

type EmptyStateProps = {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]",
        className,
      )}
    >
      <div className={action ? "mb-4" : undefined}>{children}</div>
      {action}
    </div>
  );
}
