"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const redirect = searchParams.get("redirect") || "/admin/settings";
  const redirectTarget = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/admin/settings";

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/admin/session");
        const data = await res.json();
        setIsAdmin(data.isAdmin);
      } catch {
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // 已登录则跳转
  useEffect(() => {
    if (!isLoading && isAdmin) {
      const targetUrl = redirectTarget && redirectTarget.startsWith("/") ? redirectTarget : "/admin/settings";
      router.push(targetUrl);
    }
  }, [isLoading, isAdmin, router, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("请输入密码");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }

      const targetUrl = redirectTarget && redirectTarget.startsWith("/") ? redirectTarget : "/admin/settings";
      router.push(targetUrl);
      router.refresh();
    } catch {
      setError("登录失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)]">
        <div className="text-[var(--text-3)]">加载中...</div>
      </div>
    );
  }

  if (isAdmin) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        <div>
          <h2 className="mt-2 text-center text-2xl font-semibold text-[var(--text-1)] sm:mt-6 sm:text-3xl">
            管理员登录
          </h2>
          <p className="mt-2 text-center text-sm text-[var(--text-2)]">
            登录后可进行管理操作
          </p>
        </div>

        <form className="mt-4 space-y-5 sm:mt-8" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <label htmlFor="password" className="sr-only">
              密码
            </label>
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-center text-sm text-[var(--danger-ink)]">
              {error}
            </div>
          )}

          <div>
            <Button
              type="submit"
              disabled={submitting}
              variant="primary"
              className="w-full"
            >
              {submitting ? "登录中..." : "登录"}
            </Button>
          </div>

          <div className="text-center">
            <Link
              href="/"
              className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)]"
            >
              返回首页 →
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)]">
        <div className="text-[var(--text-3)]">加载中...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
