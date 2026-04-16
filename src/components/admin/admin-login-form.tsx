"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";

export function AdminLoginForm() {
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

        window.location.href = "/admin/settings";
      } catch {
        setMessage(fallbackMessage);
      }
    });
  };

  return (
    <PageShell>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,420px)] lg:items-start">
        <div className="space-y-6">
          <PageHeader
            title="管理员登录"
            description="后台访问受密码保护，登录后可管理抓取、审核与配置。"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-[color:var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                Access Scope
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                登录后进入后台设置页，可继续处理抓取调度、配置维护与内容审核相关操作。
              </p>
            </div>

            <div className="rounded-3xl border border-[color:var(--line)] bg-[var(--surface-muted)] p-5 shadow-[var(--shadow-sm)]">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Security
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                使用统一管理员密码验证身份，失败时保留原有错误反馈，成功后跳转到 `/admin/settings`。
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[color:var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <form className="space-y-6" onSubmit={submit}>
            <div className="space-y-2">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--muted)]">Secure Sign-In</h2>
              <p className="text-sm leading-7 text-[var(--muted)]">
                输入管理员密码后继续访问，界面已切换为更通用的控制台壳层，验证与跳转逻辑保持不变。
              </p>
            </div>

            <label className="grid gap-3 text-sm font-medium text-[var(--foreground)]">
              <span>管理员密码</span>
              <input
                className="w-full rounded-2xl border border-[color:var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[rgba(37,99,235,0.14)]"
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
