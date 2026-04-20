import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { GlobalHeader } from "@/components/ui/global-header";
import { cx } from "@/lib/ui/cx";

type PageShellNav = "home" | "admin" | null;

type PageShellHeader = {
  activeNav: PageShellNav;
  isAdmin: boolean;
};

type PageShellProps = ComponentPropsWithoutRef<"main"> & {
  children: ReactNode;
  contentClassName?: string;
  contentWidth?: "default" | "workspace";
  header?: PageShellHeader | null;
  chromeLabel?: string | null;
  sidebar?: ReactNode;
  sidebarContainerClassName?: string;
  sidebarVisibility?: "always" | "lg" | "xl";
};

export function PageShell({
  children,
  header,
  chromeLabel = null,
  className,
  contentClassName,
  contentWidth = "default",
  sidebar,
  sidebarContainerClassName,
  sidebarVisibility = "always",
  ...props
}: PageShellProps) {
  return (
    <main
      className={cx(
        "min-h-screen bg-[var(--background)] text-[var(--foreground)]",
        className,
      )}
      {...props}
    >
      {header ? <GlobalHeader activeNav={header.activeNav} isAdmin={header.isAdmin} /> : null}

      {!header && chromeLabel ? (
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
          "mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
          contentWidth === "workspace" ? "max-w-[92rem]" : "max-w-7xl",
          contentClassName,
        )}
      >
        {sidebar ? (
          <div
            className={cx(
              "flex flex-col gap-6",
              sidebarVisibility === "lg" ? "lg:flex-row" : null,
              sidebarVisibility === "xl" ? "xl:grid xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start xl:gap-4" : null,
            )}
          >
            <div
              className={cx(
                "min-w-0",
                sidebarVisibility === "always" ? "w-full" : null,
                sidebarVisibility === "lg" ? "hidden lg:block" : null,
                sidebarVisibility === "xl" ? "hidden xl:block" : null,
                sidebarContainerClassName,
              )}
            >
              {sidebar}
            </div>
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </main>
  );
}
