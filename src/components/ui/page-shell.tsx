import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cx } from "@/lib/ui/cx";

type PageShellProps = ComponentPropsWithoutRef<"main"> & {
  children: ReactNode;
  contentClassName?: string;
  chromeLabel?: string | null;
};

export function PageShell({ children, chromeLabel = "Infinitum Admin", className, contentClassName, ...props }: PageShellProps) {
  return (
    <main
      className={cx(
        "min-h-screen bg-[var(--background)] text-[var(--foreground)]",
        className,
      )}
      {...props}
    >
      {chromeLabel ? (
        <div className="border-b border-[color:var(--line)] bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6 lg:px-8">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--muted)]">
              {chromeLabel}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={cx(
          "mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12",
          contentClassName,
        )}
      >
        {children}
      </div>
    </main>
  );
}
