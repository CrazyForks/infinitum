import { cx } from "@/lib/ui/cx";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
};

export function PageHeader({
  eyebrow = "Infinitum",
  title,
  description,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("space-y-4", className)}>
      <p className="inline-flex rounded-full border border-[color:var(--line-strong)] bg-[var(--accent-soft)] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
        {eyebrow}
      </p>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-4xl">
          {title}
        </h1>
        {description ? <p className="max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">{description}</p> : null}
      </div>
    </header>
  );
}
