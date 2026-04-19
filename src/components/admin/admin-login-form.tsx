"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";

export const loginSuccessRedirect = {
  assign(url: string) {
    window.location.assign(url);
  },
};

type AdminLoginFormProps = {
  redirectPath?: string;
};

export function AdminLoginForm({ redirectPath }: AdminLoginFormProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fallbackMessage = "登录失败";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      setMessage(null);

      try {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ password }),
        });

        let payload: {
          authenticated?: boolean;
          error?: string;
        };

        try {
          payload = (await response.json()) as {
            authenticated?: boolean;
            error?: string;
          };
        } catch {
          setMessage(fallbackMessage);
          return;
        }

        if (!response.ok || payload.error) {
          setMessage(payload.error ?? fallbackMessage);
          return;
        }

        const targetUrl = redirectPath && redirectPath.startsWith("/") ? redirectPath : "/admin/settings";
        loginSuccessRedirect.assign(targetUrl);
      } catch {
        setMessage(fallbackMessage);
      }
    });
  };

  return (
    <PageShell header={{ activeNav: null, isAdmin: false }}>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,420px)] xl:items-start">
        <div className="space-y-5">
          <PageHeader
            eyebrow="Admin Access"
            title="管理员登录"
            description="使用统一入口访问审核与管理后台。"
          />

          <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <article className="rounded-[1.75rem] border border-[color:var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                Console Scope
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">统一管理入口</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                登录后保持原有跳转到 `/admin/settings` 的行为，同时通过共享壳层快速切换到审核与后台管理。
              </p>
            </article>

            <article className="rounded-[1.75rem] border border-[color:var(--line)] bg-[var(--surface-muted)] p-5 shadow-[var(--shadow-sm)]">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Security
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                登录请求、错误提示与成功跳转逻辑保持不变；这里只重做共享 Header 和更紧凑的控制台排版。
              </p>
            </article>
          </div>
        </div>

        <div className="rounded-[1.9rem] border border-[color:var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <form className="space-y-6" onSubmit={submit}>
            <div className="space-y-2">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--muted)]">Secure Sign-In</h2>
              <p className="text-sm leading-7 text-[var(--muted)]">
                输入管理员密码后继续访问，系统会保持既有的验证、失败反馈与成功跳转流程。
              </p>
            </div>

            <label className="grid gap-3 text-sm font-medium text-[var(--foreground)]">
              <span>管理员密码</span>
              <input
                className="w-full rounded-2xl border border-[color:var(--line)] bg-[var(--surface-highlight)] px-4 py-3 text-base text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[rgba(33,111,255,0.12)]"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {message ? <StatusBanner tone="error">{message}</StatusBanner> : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]"
              type="submit"
              disabled={isPending || !password.trim()}
            >
              {isPending ? "登录中..." : "登录"}
            </button>
          </form>
        </div>
      </section>
    </PageShell>
  );
}
