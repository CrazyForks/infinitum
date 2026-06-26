import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className = "", compact = false, ...props },
  ref,
) {
  const baseClassName = compact ? "h-8 px-2.5" : "h-9 px-3";

  return (
    <input
      ref={ref}
      className={`w-full ${baseClassName} rounded-sm border border-[color:var(--control-line)] bg-[var(--control-surface)] text-sm text-[var(--foreground)] placeholder:text-sm placeholder:text-[var(--text-3)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition focus-visible:border-[color:var(--control-line-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
});
