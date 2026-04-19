import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

type SelectableButtonVariant = "tab" | "pill" | "menu" | "submenu";

interface SelectableButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active: boolean;
  variant?: SelectableButtonVariant;
}

// Lumina uses --bg-muted (#f1f1f3) for both active and hover on menu/submenu
// In infinitum, --bg-muted is #f1f1f3 (same as Lumina)
const variantBaseClassName: Record<SelectableButtonVariant, string> = {
  tab: "px-6 py-3 text-sm font-medium rounded-t-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
  pill: "px-4 py-2 text-sm rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
  menu: "w-full px-4 py-3 text-left rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
  submenu: "w-full px-6 py-2 text-left text-sm rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
};

// menu/submenu use --bg-muted (gray) for both active and hover, like Lumina
const getMenuClassName = (isActive: boolean): string => {
  if (isActive) {
    return "bg-[var(--bg-muted)] text-[var(--text-1)]";
  }
  return "text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-muted)]";
};

export function SelectableButton({
  children,
  active,
  variant = "pill",
  className = "",
  type,
  ...props
}: SelectableButtonProps) {
  let stateClassName: string;

  if (variant === "tab" || variant === "pill") {
    stateClassName = active
      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : variant === "tab"
        ? "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]"
        : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-highlight)] hover:text-[var(--foreground)]";
  } else {
    // menu and submenu - both active and hover use gray bg like Lumina
    stateClassName = getMenuClassName(active);
  }

  return (
    <button
      type={type ?? "button"}
      className={cx(
        variantBaseClassName[variant],
        stateClassName,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
