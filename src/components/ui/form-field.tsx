import type { ReactNode } from "react";

type FormFieldProps = {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  labelClassName?: string;
};

const defaultLabelClassName = "mb-1.5 block text-sm text-[var(--muted)]";

export function FormField({
  label,
  htmlFor,
  required = false,
  children,
  hint,
  className = "",
  labelClassName = "",
}: FormFieldProps) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className={`${defaultLabelClassName} ${labelClassName}`.trim()}>
          <span>{label}</span>
          {required ? <span className="ml-1 text-[var(--danger-ink)]">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint ? <div className="mt-1 text-xs text-[var(--text-3)]">{hint}</div> : null}
    </div>
  );
}
