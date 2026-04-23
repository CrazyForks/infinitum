import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  compact?: boolean;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className = "", compact = false, ...props },
  ref,
) {
  const paddingClassName = compact ? "px-2.5 py-1.5" : "px-3 py-2";

  return (
    <textarea
      ref={ref}
      className={`w-full ${paddingClassName} rounded-sm border border-[color:var(--line)] bg-[var(--surface)] text-sm text-[var(--text-1)] placeholder:text-sm placeholder:text-[var(--text-3)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition focus-visible:border-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
});
