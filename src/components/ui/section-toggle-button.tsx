import type { ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

interface SectionToggleButtonProps {
  label: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  onMainClick?: () => void;
  active?: boolean;
  icon?: ReactNode;
  expandedIndicator?: ReactNode;
  collapsedIndicator?: ReactNode;
  toggleAriaLabel?: string;
  className?: string;
}

export function SectionToggleButton({
  label,
  expanded,
  onToggle,
  onMainClick,
  active = false,
  icon,
  expandedIndicator,
  collapsedIndicator,
  toggleAriaLabel,
  className = "",
}: SectionToggleButtonProps) {
  const containerClassName = cx(
    "w-full rounded-sm transition text-[var(--muted)]",
    active ? "bg-[var(--surface)] text-[var(--foreground)]" : "hover:text-[var(--foreground)] hover:bg-[var(--surface)]",
    className
  );
  const indicator = expanded ? expandedIndicator : collapsedIndicator;

  if (onMainClick) {
    return (
      <div className={cx(containerClassName, "flex items-center")}>
        <button
          type="button"
          onClick={onMainClick}
          className="flex-1 inline-flex items-center gap-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          {icon}
          <span>{label}</span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="px-3 py-3 text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
          aria-label={toggleAriaLabel}
        >
          {indicator}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cx(
        containerClassName,
        "flex w-full items-center justify-between px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
      )}
    >
      <span>{label}</span>
      <span className="text-[var(--muted)]">{indicator}</span>
    </button>
  );
}
