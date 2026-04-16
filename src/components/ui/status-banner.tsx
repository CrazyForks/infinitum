import type { ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

const toneClasses = {
  error: "border-[color:var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger-ink)]",
  info: "border-[color:var(--line-strong)] bg-[var(--surface-muted)] text-[var(--foreground)]",
  success: "border-[color:var(--success-line)] bg-[var(--success-surface)] text-[var(--success-ink)]",
} as const;

type StatusBannerProps = {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof toneClasses;
};

export function StatusBanner({ children, className, tone = "info" }: StatusBannerProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-2xl border px-4 py-3 text-sm leading-6 shadow-[var(--shadow-sm)]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
