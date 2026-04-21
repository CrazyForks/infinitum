"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { IconGithub, IconLock, IconLogout, IconSettings } from "@/components/ui/icons";
import { cx } from "@/lib/ui/cx";

type GlobalHeaderProps = {
  activeNav: "home" | "admin" | null;
  isAdmin: boolean;
};

const navItems = [
  { href: "/", key: "home", label: "主页" },
] as const;

export function GlobalHeader({ activeNav, isAdmin }: GlobalHeaderProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const headerIconButtonClass =
    "inline-flex items-center justify-center w-8 h-8 rounded-sm text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-muted)] transition";

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
        "border-b border-[color:var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)]",
        activeNav === "home" ? null : "sticky top-0 z-40",
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            className="inline-flex shrink-0 items-center gap-2 text-[var(--foreground)]"
            href="/"
          >
            <svg
              className="logo-mark h-7 w-7"
              width="28"
              height="28"
              viewBox="0 0 128 128"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Infinitum"
            >
              <rect width="128" height="128" rx="28" fill="#111111" />
              <path
                d="M24 34C24 28.4772 28.4772 24 34 24H94C99.5228 24 104 28.4772 104 34V94C104 99.5228 99.5228 104 94 104H34C28.4772 104 24 99.5228 24 94V34Z"
                stroke="#111111"
                strokeWidth="2"
              />
              <path
                d="M34 40H94"
                stroke="white"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M42 60H86"
                stroke="white"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M51 80H77"
                stroke="white"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M64 92V104"
                stroke="white"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M56 97L64 105L72 97"
                stroke="white"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-2xl font-bold">Infinitum</span>
          </Link>

          <nav aria-label="主导航" className="hidden min-w-0 flex-1 items-center gap-2 text-base font-medium lg:flex">
            {navItems.map((item) => {
              const isActive = item.key === activeNav;

              return (
                <Link
                  key={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cx(
                    "px-3 py-1 rounded-sm transition",
                    isActive
                      ? "bg-[var(--bg-muted)] text-[var(--text-1)]"
                      : "text-[var(--text-2)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]",
                  )}
                  href={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/shawnxie94/infinitum"
            target="_blank"
            rel="noreferrer"
            className={headerIconButtonClass}
            aria-label="GitHub"
            title="GitHub"
          >
            <IconGithub className="h-4 w-4" />
          </a>
          {isAdmin && (
            <Link
              href="/admin"
              prefetch={false}
              className={headerIconButtonClass}
              aria-label="管理"
              title="管理"
            >
              <IconSettings className="h-4 w-4" />
            </Link>
          )}
          {isAdmin ? (
            <button
              aria-label="登出"
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-[var(--text-3)] hover:text-[var(--danger-ink)] hover:bg-[var(--danger-surface)] transition disabled:cursor-not-allowed disabled:opacity-55"
              disabled={isPending}
              onClick={logout}
              type="button"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          ) : (
            <button
              aria-label="登录"
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-[var(--text-3)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition"
              onClick={goToLogin}
              type="button"
            >
              <IconLock className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
