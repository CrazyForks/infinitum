import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

type IconButtonVariant = "ghost" | "secondary";
type IconButtonSize = "sm" | "md";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  title?: string;
}

const variantClassName: Record<IconButtonVariant, string> = {
  ghost: "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-muted)]",
  secondary: "border border-transparent text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-muted)]",
};

const sizeClassName: Record<IconButtonSize, string> = {
  sm: "p-1.5",
  md: "p-2",
};

export function IconButton({
  children,
  variant = "ghost",
  size = "md",
  className = "",
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      className={cx(
        "inline-flex items-center justify-center rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 disabled:cursor-not-allowed disabled:opacity-50",
        variantClassName[variant],
        sizeClassName[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
