import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const buttonVariantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:opacity-90",
  secondary: "bg-[var(--surface)] text-[var(--muted)] border border-[color:var(--line)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
  danger: "bg-[var(--danger-ink)] text-white hover:opacity-90",
  ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
};

const buttonSizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center rounded-sm transition font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button
      type="button"
      className={`${baseStyles} ${buttonVariantStyles[variant]} ${buttonSizeStyles[size]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? "处理中..." : children}
    </button>
  );
}
