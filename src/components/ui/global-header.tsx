"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cx } from "@/lib/ui/cx";

type GlobalHeaderProps = {
  activeNav: "home" | "review" | "monitor" | "admin" | null;
  isAdmin: boolean;
};

const navItems = [
  { href: "/", key: "home", label: "主页" },
  { href: "/admin/content", key: "review", label: "审核" },
  { href: "/admin/monitor", key: "monitor", label: "任务" },
  { href: "/admin/settings", key: "admin", label: "管理" },
] as const;

function HeaderActionIcon({ direction }: { direction: "enter" | "leave" }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={
          direction === "enter"
            ? "M6 3.5H3.75A1.75 1.75 0 0 0 2 5.25v5.5c0 .967.783 1.75 1.75 1.75H6M8 4l4 4-4 4M11.5 8H5"
            : "M10 3.5h2.25c.967 0 1.75.783 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 12.5H10M8 4 4 8l4 4M4.5 8H11"
        }
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function GlobalHeader({ activeNav, isAdmin }: GlobalHeaderProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const goToLogin = () => {
    startTransition(() => {
      const currentPath = window.location.pathname;
      const loginUrl = currentPath !== "/login" ? `/login?redirect=${encodeURIComponent(currentPath)}` : "/login";
      router.push(loginUrl);
    });
  };

  const logout = () => {
    setIsPending(true);

    startTransition(async () => {
      try {
        await fetch("/api/admin/logout", {
          method: "POST",
        });
      } finally {
        router.push("/login");
        router.refresh();
        setIsPending(false);
      }
    });
  };

  return (
    <header
      className={cx(
        "border-b border-[color:var(--line)] bg-[color:var(--surface-overlay)]/92 backdrop-blur-xl",
        activeNav === "home" ? null : "sticky top-0 z-40",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          className="inline-flex shrink-0 items-center gap-3 text-[13px] font-semibold tracking-[0.18em] text-[var(--foreground)] uppercase"
          href="/"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--line-strong)] bg-[var(--surface-highlight)] text-[11px] tracking-[0.12em]">
            IN
          </span>
          <span>Infinitum</span>
        </Link>

        <nav aria-label="主导航" className="flex min-w-0 flex-1 items-center gap-1.5">
          {navItems.map((item) => {
            const isActive = item.key === activeNav;

            return (
              <Link
                key={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm transition sm:px-4",
                  isActive
                    ? "border-[color:var(--line-strong)] bg-[var(--surface-highlight)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
                    : "border-transparent text-[var(--muted)] hover:border-[color:var(--line)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                )}
                href={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isAdmin ? (
          <button
            aria-label="登出"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface-highlight)] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isPending}
            onClick={logout}
            type="button"
          >
            <HeaderActionIcon direction="leave" />
          </button>
        ) : (
          <button
            aria-label="登录"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface-highlight)]"
            onClick={goToLogin}
            type="button"
          >
            <HeaderActionIcon direction="enter" />
          </button>
        )}
      </div>
    </header>
  );
}
