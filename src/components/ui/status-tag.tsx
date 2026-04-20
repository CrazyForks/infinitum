import type { ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

type StatusTone = "success" | "danger" | "info" | "warning" | "neutral";

interface StatusTagProps {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}

const toneClassName: Record<StatusTone, string> = {
  success: "bg-[var(--success-surface)] text-[var(--success-ink)] border-[var(--success-line)]",
  danger: "bg-[var(--danger-surface)] text-[var(--danger-ink)] border-[var(--danger-line)]",
  info: "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-soft)]",
  warning: "bg-[var(--warning-surface)] text-[var(--warning-ink)] border-[var(--warning-line)]",
  neutral: "bg-[var(--surface-muted)] text-[var(--muted)] border-[color:var(--line)]",
};

export function StatusTag({
  children,
  tone = "neutral",
  className = "",
}: StatusTagProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-sm",
        toneClassName[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
