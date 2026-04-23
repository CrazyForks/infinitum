# Infinitum Lumina Layout Density Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `infinitum` 全站进一步改造成高保真 `Lumina` 风格：统一顶部 Header、切换同款字体、提升首页与后台页信息密度，并保持现有业务行为与测试通过。

**Architecture:** 先落共享骨架，再重做首页信息流，最后统一后台页。共享层通过新的全站 Header、字体资源与全局 token 承担视觉一致性；页面层只重排结构与密度，不改 API 与数据流。每个任务都先补结构/行为测试，再做最小实现，最后以构建与全量测试收尾。

**Tech Stack:** Next.js 16 App Router、React 19、Tailwind CSS 4、Vitest、Testing Library、本地字体资源（`LXGW WenKai Mono`）

---

## File Map

### Shared shell and typography

- Create: `src/components/ui/global-header.tsx`
- Modify: `src/components/ui/page-shell.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `public/fonts/LXGWWenKaiMono.ttf`
- Create: `tests/components/global-header.test.tsx`

### Homepage list density

- Modify: `src/components/feed/feed-panel.tsx`
- Modify: `tests/components/feed-panel.test.tsx`

### Admin pages

- Modify: `src/components/admin/admin-login-form.tsx`
- Modify: `src/components/admin/content-review-panel.tsx`
- Modify: `src/components/admin/admin-monitor-panel.tsx`
- Modify: `src/components/admin/admin-settings-panel.tsx`
- Modify: `tests/components/admin-login-form.test.tsx`
- Modify: `tests/components/content-review-panel.test.tsx`
- Modify: `tests/components/admin-monitor-panel.test.tsx`
- Modify: `tests/components/admin-settings-panel.test.tsx`

### Final stabilization

- Inspect: `tests/integration/feed-api.test.ts`
- Reuse: `tests/unit/ui-style-imports.test.ts`

---

### Task 1: Shared Lumina Shell, Header, and Font

**Files:**
- Create: `src/components/ui/global-header.tsx`
- Modify: `src/components/ui/page-shell.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Create: `public/fonts/LXGWWenKaiMono.ttf`
- Create: `tests/components/global-header.test.tsx`
- Modify: `tests/components/admin-login-form.test.tsx`

- [ ] **Step 1: Write the failing header structure test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GlobalHeader } from "@/components/ui/global-header";

describe("GlobalHeader", () => {
  it("renders the shared lumina-style navigation and auth action", () => {
    render(<GlobalHeader activeNav="home" isAdmin={false} />);

    expect(screen.getByRole("link", { name: "主页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "审核" })).toHaveAttribute("href", "/admin/content");
    expect(screen.getByRole("link", { name: "管理" })).toHaveAttribute("href", "/admin/settings");
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("renders the logout action for admin sessions", () => {
    render(<GlobalHeader activeNav="admin" isAdmin />);

    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write the failing login shell assertion update**

```tsx
it("renders the shared lumina shell before login", () => {
  render(<AdminLoginForm />);

  expect(screen.getByRole("link", { name: "主页" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "审核" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "管理" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "管理员登录" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the header and login tests to verify they fail**

Run:
```bash
npx vitest run tests/components/global-header.test.tsx tests/components/admin-login-form.test.tsx --reporter=dot
```

Expected:
- FAIL，因为 `GlobalHeader` 尚不存在
- 或旧的 `PageShell` / `AdminLoginForm` 尚未渲染新导航

- [ ] **Step 4: Add the shared header component**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cx } from "@/lib/ui/cx";

type GlobalHeaderProps = {
  activeNav: "home" | "review" | "admin";
  isAdmin: boolean;
};

const navItems = [
  { href: "/", label: "主页", key: "home" },
  { href: "/admin/content", label: "审核", key: "review" },
  { href: "/admin/settings", label: "管理", key: "admin" },
] as const;

export function GlobalHeader({ activeNav, isAdmin }: GlobalHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const logout = () => {
    startTransition(async () => {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[rgba(247,247,248,0.92)] backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link className="shrink-0 font-sans text-sm font-semibold tracking-[0.04em]" href="/">
          Infinitum
        </Link>

        <nav aria-label="主导航" className="flex min-w-0 flex-1 items-center gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "inline-flex min-h-9 items-center rounded-full px-3 text-sm text-[var(--text-2)] transition",
                activeNav === item.key && "bg-[var(--bg-muted)] text-[var(--text-1)]",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button
              aria-label="登出"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)]"
              disabled={isPending}
              type="button"
              onClick={logout}
            >
              ↗
            </button>
          ) : (
            <Link
              aria-label="登录"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)]"
              href="/admin/login"
            >
              •
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Thread the header through `PageShell`**

```tsx
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { GlobalHeader } from "@/components/ui/global-header";
import { cx } from "@/lib/ui/cx";

type PageShellProps = ComponentPropsWithoutRef<"main"> & {
  children: ReactNode;
  contentClassName?: string;
  header?: {
    activeNav: "home" | "review" | "admin";
    isAdmin: boolean;
  } | null;
};

export function PageShell({ children, header, className, contentClassName, ...props }: PageShellProps) {
  return (
    <main className={cx("min-h-screen bg-[var(--bg-app)] text-[var(--text-1)]", className)} {...props}>
      {header ? <GlobalHeader activeNav={header.activeNav} isAdmin={header.isAdmin} /> : null}
      <div className={cx("mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8", contentClassName)}>
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Switch global font and token baseline to Lumina**

```css
@font-face {
  font-family: "LXGW WenKai Mono";
  src: url("/fonts/LXGWWenKaiMono.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --bg-app: #f7f7f8;
  --bg-surface: #ffffff;
  --bg-muted: #f1f1f3;
  --text-1: #111111;
  --text-2: #434343;
  --text-3: #7a7a7a;
  --border: #e6e6e8;
  --border-strong: #d4d4d8;
  --accent: #3b82f6;
  --accent-soft: #e8f0ff;
  --accent-ink: #1e3a8a;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 6px 18px rgba(0, 0, 0, 0.08);
  --font-body: "LXGW WenKai Mono", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "LXGW WenKai Mono", system-ui, sans-serif;
  --font-mono: "LXGW WenKai Mono", ui-monospace, monospace;
}

body {
  background: var(--bg-app);
  color: var(--text-1);
  font-family: var(--font-body);
}
```

- [ ] **Step 7: Update the app layout metadata and body wrapper if needed**

```tsx
export const metadata: Metadata = {
  title: "Infinitum",
  description: "高信息密度的编辑型信息流与管理后台。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Update the login page to adopt the new shared shell**

```tsx
return (
  <PageShell header={{ activeNav: "admin", isAdmin: false }} contentClassName="gap-5">
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_380px]">
      <div className="space-y-4">
        <PageHeader
          eyebrow="Admin Access"
          title="管理员登录"
          description="使用统一入口访问审核与管理后台。"
          className="space-y-3"
        />
      </div>
      <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-sm)] sm:p-7">
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--text-3)]">Secure Sign-In</h2>
            <p className="text-sm leading-6 text-[var(--text-2)]">
              输入管理员密码后继续访问，验证失败提示和成功后跳转逻辑保持不变。
            </p>
          </div>

          <label className="grid gap-2 text-sm font-medium text-[var(--text-1)]">
            <span>管理员密码</span>
            <input
              className="min-h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {message ? <StatusBanner tone="error">{message}</StatusBanner> : null}

          <button
            className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
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
```

- [ ] **Step 9: Run the shared shell tests and verify they pass**

Run:
```bash
npx vitest run tests/components/global-header.test.tsx tests/components/admin-login-form.test.tsx --reporter=dot
```

Expected:
- PASS

- [ ] **Step 10: Commit the shared shell work**

```bash
git add src/components/ui/global-header.tsx src/components/ui/page-shell.tsx src/app/layout.tsx src/app/globals.css public/fonts/LXGWWenKaiMono.ttf tests/components/global-header.test.tsx tests/components/admin-login-form.test.tsx src/components/admin/admin-login-form.tsx
git commit -m "feat: add lumina-style shared shell"
```

### Task 2: Rebuild the Homepage as a Dense Lumina-style Feed List

**Files:**
- Modify: `src/components/feed/feed-panel.tsx`
- Modify: `tests/components/feed-panel.test.tsx`

- [ ] **Step 1: Add failing homepage structure assertions**

```tsx
it("renders the lumina-style header and dense filter toolbar", () => {
  render(
    <FeedPanel
      initialItems={initialEntries}
      initialRange="7d"
      initialSort="time_desc"
      initialStartDate={null}
      initialEndDate={null}
      initialNextCursor={null}
      initialStatus={null}
      isAdmin={false}
    />,
  );

  expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "主页" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "信息流筛选" })).toBeInTheDocument();
  expect(screen.getByText("筛选")).toBeInTheDocument();
});
```

- [ ] **Step 2: Add a failing dense-card assertion**

```tsx
it("renders compact metadata rows for feed cards", () => {
  render(
    <FeedPanel
      initialItems={initialEntries}
      initialRange="7d"
      initialSort="time_desc"
      initialStartDate={null}
      initialEndDate={null}
      initialNextCursor={null}
      initialStatus={null}
      isAdmin={false}
    />,
  );

  expect(screen.getByText("Example Feed")).toBeInTheDocument();
  expect(screen.getByText("高质量 90")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the homepage test file to verify failure**

Run:
```bash
npx vitest run tests/components/feed-panel.test.tsx --reporter=dot
```

Expected:
- FAIL，因为现有结构还是偏工作台、标题区偏高、导航不在共享 header 中

- [ ] **Step 4: Swap the feed shell to the shared header and compact page rhythm**

```tsx
return (
  <PageShell header={{ activeNav: "home", isAdmin }} contentClassName="gap-4">
    <section className="space-y-3">
      <PageHeader
        eyebrow="Feed"
        title="信息流列表"
        description="参考 Lumina 的编辑型列表布局，将筛选与列表密集收敛在同一工作区。"
        className="space-y-2"
      />
    </section>

    <section aria-label="信息流筛选" className="rounded-[1.25rem] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)]">
      {renderDenseFilterToolbar()}
    </section>

    <section className="space-y-3">
      {items.map((entry) => (
        <FeedEntryCard
          key={entry.id}
          entry={entry}
          isAdmin={isAdmin}
          isOpen={Boolean(openClusters[entry.id])}
          previewItems={expandedClusters[entry.id] ?? entry.itemsPreview ?? []}
          onToggleCluster={() => void toggleCluster(entry)}
          onRefreshTranslation={(itemId) => queueItemTask(itemId, "translation")}
          onRefreshSummary={(itemId) => queueItemTask(itemId, "summary")}
        />
      ))}
    </section>
  </PageShell>
);
```

- [ ] **Step 5: Rewrite the filter bar into a denser two-row toolbar**

```tsx
<div className="grid gap-3">
  <div className="flex flex-wrap items-end gap-3">
    <div className="min-w-[120px]">
      <label className="mb-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">范围</label>
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={cx(
              "inline-flex min-h-9 items-center rounded-full px-3 text-sm transition",
              option.value === range ? "bg-[var(--text-1)] text-white" : "bg-[var(--bg-muted)] text-[var(--text-2)]",
            )}
            type="button"
            onClick={() => loadRange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
    <label className="min-w-[180px]">
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">排序</span>
      <select aria-label="排序方式" className="min-h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm">
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
    <button className="inline-flex min-h-10 items-center rounded-xl border border-[color:var(--border)] px-3 text-sm">
      刷新列表
    </button>
  </div>

  <div className="grid gap-3 md:grid-cols-4">
    <label className="grid gap-1 text-sm text-[var(--text-2)]">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">开始日期</span>
      <input
        aria-label="开始日期"
        className="min-h-10 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm"
        type="date"
        value={startDate ?? ""}
        onChange={(event) => setStartDate(event.target.value || null)}
      />
    </label>
    <label className="grid gap-1 text-sm text-[var(--text-2)]">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">结束日期</span>
      <input
        aria-label="结束日期"
        className="min-h-10 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm"
        type="date"
        value={endDate ?? ""}
        onChange={(event) => setEndDate(event.target.value || null)}
      />
    </label>
    <label className="grid gap-1 text-sm text-[var(--text-2)]">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">分组</span>
      <select
        aria-label="分组筛选"
        className="min-h-10 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm"
        value={groupId ?? ""}
        onChange={(event) => changeGroup(event.target.value)}
      >
        <option value="">全部内容</option>
        {availableGroups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
    <label className="grid gap-1 text-sm text-[var(--text-2)]">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">来源</span>
      <select
        aria-label="来源筛选"
        className="min-h-10 rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm"
        value={sourceId ?? ""}
        onChange={(event) => changeSource(event.target.value)}
      >
        <option value="">全部来源</option>
        {visibleSources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>
    </label>
  </div>
</div>
```

- [ ] **Step 6: Tighten list cards to a scan-first layout**

```tsx
<article className="rounded-[1.25rem] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)]">
  <div className="flex flex-col gap-3">
    <div className="flex items-start justify-between gap-4">
      <h2 className="text-lg font-semibold leading-6 text-[var(--text-1)]">{entry.title}</h2>
      <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] text-[var(--accent-ink)]">
        {formatScore(entry.score)}
      </span>
    </div>

    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-3)]">
      <span>{entry.type === "cluster" ? "聚合" : entry.sourceName}</span>
      <span>{formatDate(entry.latestPublishedAt)}</span>
      <span>{entry.itemCount} 条</span>
      <span>{entry.sourceCount} 源</span>
    </div>

    <p className="line-clamp-3 text-sm leading-6 text-[var(--text-2)]">{entry.summary}</p>
  </div>
</article>
```

- [ ] **Step 7: Keep cluster preview but compress it**

```tsx
{entry.type === "cluster" && isOpen ? (
  <div className="mt-3 grid gap-2 rounded-xl bg-[var(--bg-muted)] p-3">
    {previewItems.map((item) => (
      <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--text-1)]">{item.title}</p>
          <p className="truncate text-xs text-[var(--text-3)]">
            {item.sourceName} · {formatDate(item.publishedAt)}
          </p>
        </div>
        <span className="text-xs text-[var(--text-3)]">{item.score}</span>
      </div>
    ))}
  </div>
) : null}
```

- [ ] **Step 8: Run the homepage test file and verify it passes**

Run:
```bash
npx vitest run tests/components/feed-panel.test.tsx --reporter=dot
```

Expected:
- PASS

- [ ] **Step 9: Commit the homepage density work**

```bash
git add src/components/feed/feed-panel.tsx tests/components/feed-panel.test.tsx
git commit -m "feat: restyle homepage feed to match lumina"
```

### Task 3: Unify Review and Login Flows Under the Dense Lumina Admin Layout

**Files:**
- Modify: `src/components/admin/content-review-panel.tsx`
- Modify: `src/components/admin/admin-login-form.tsx`
- Modify: `tests/components/content-review-panel.test.tsx`
- Modify: `tests/components/admin-login-form.test.tsx`

- [ ] **Step 1: Add failing shared-header assertions to the review page test**

```tsx
expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "审核" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "内容审核工作台" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the review and login tests to verify failure**

Run:
```bash
npx vitest run tests/components/content-review-panel.test.tsx tests/components/admin-login-form.test.tsx --reporter=dot
```

Expected:
- FAIL，因为 review/login 仍保留旧的快捷入口结构与较宽松密度

- [ ] **Step 3: Replace local quick-links with the shared header and denser list rhythm**

```tsx
<PageShell header={{ activeNav: "review", isAdmin: true }} contentClassName="gap-4">
  <PageHeader
    eyebrow="Content Review"
    title="内容审核工作台"
    description="将过滤内容与聚合管理压缩为更接近 Lumina 后台的密集列表。"
    className="space-y-2"
  />
</PageShell>
```

- [ ] **Step 4: Tighten filtered-item and cluster cards**

```tsx
<article className="rounded-[1.25rem] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)]">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{item.title}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-3)]">
          <span>{item.sourceName}</span>
        <span>{formatDateTime(item.publishedAt)}</span>
        <span>{getReviewReasonLabel(item.moderationReason)}</span>
        <span>{item.qualityScore}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex min-h-9 items-center rounded-xl border border-[color:var(--border)] px-3 text-sm" type="button">
          恢复内容
        </button>
        <button className="inline-flex min-h-9 items-center rounded-xl bg-[var(--accent)] px-3 text-sm font-medium text-white" type="button">
          重新 AI 判定
        </button>
      </div>
    </div>
  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--text-2)]">{item.summary}</p>
</article>
```

- [ ] **Step 5: Keep login behavior but align its density to the new shell**

```tsx
<div className="rounded-[1.25rem] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]">
  <form className="space-y-5" onSubmit={submit}>
    <div className="space-y-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--text-3)]">Secure Sign-In</h2>
      <p className="text-sm leading-6 text-[var(--text-2)]">输入管理员密码后继续访问，校验逻辑与跳转逻辑保持不变。</p>
    </div>

    <label className="grid gap-2 text-sm font-medium text-[var(--text-1)]">
      <span>管理员密码</span>
      <input
        className="min-h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
    </label>

    {message ? <StatusBanner tone="error">{message}</StatusBanner> : null}

    <button
      className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
      type="submit"
      disabled={isPending || !password.trim()}
    >
      {isPending ? "登录中..." : "登录"}
    </button>
  </form>
</div>
```

- [ ] **Step 6: Run the review and login tests and verify they pass**

Run:
```bash
npx vitest run tests/components/content-review-panel.test.tsx tests/components/admin-login-form.test.tsx --reporter=dot
```

Expected:
- PASS

- [ ] **Step 7: Commit the review/login density work**

```bash
git add src/components/admin/content-review-panel.tsx src/components/admin/admin-login-form.tsx tests/components/content-review-panel.test.tsx tests/components/admin-login-form.test.tsx
git commit -m "feat: densify review and login layouts"
```

### Task 4: Densify Monitor and Settings Under the Same Admin Shell

**Files:**
- Modify: `src/components/admin/admin-monitor-panel.tsx`
- Modify: `src/components/admin/admin-settings-panel.tsx`
- Modify: `tests/components/admin-monitor-panel.test.tsx`
- Modify: `tests/components/admin-settings-panel.test.tsx`

- [ ] **Step 1: Add failing shared-header assertions for monitor/settings**

```tsx
expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "管理" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "调度设置" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "基础配置" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the monitor/settings tests to verify failure**

Run:
```bash
npx vitest run tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx --reporter=dot
```

Expected:
- FAIL，因为新共享 header 与更紧凑布局尚未落地

- [ ] **Step 3: Put monitor under the shared admin header and compress section spacing**

```tsx
<PageShell header={{ activeNav: "admin", isAdmin: true }} contentClassName="gap-4">
  <PageHeader
    eyebrow="Task Monitor"
    title="任务监控"
    description="默认抓取调度、运行中任务和最近任务采用更紧凑的后台记录布局。"
    className="space-y-2"
  />
</PageShell>
```

- [ ] **Step 4: Make monitor cards flatter and more row-like**

```tsx
<article className="rounded-[1.25rem] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)]">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="space-y-2">
      <h3 className="text-base font-semibold">{task.label}</h3>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-3)]">
        <span>{statusLabels[task.status]}</span>
        <span>{triggerTypeLabels[task.triggerType]}</span>
        <span>{taskKindLabels[task.kind]}</span>
      </div>
    </div>
    <button
      className="inline-flex min-h-9 items-center rounded-xl border border-[color:var(--border)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
      type="button"
      disabled={Boolean(task.cancelRequestedAt) || cancellingTaskId === task.id}
      onClick={() => void onCancel(task.id)}
    >
      {task.cancelRequestedAt ? "终止中" : "终止任务"}
    </button>
  </div>
</article>
```

- [ ] **Step 5: Densify settings into tighter section panels and row editors**

```tsx
<SectionCard
  title="基础配置"
  headingId="settings-basic"
  description="维护模型连接、并发参数与分析提示词。"
  className="space-y-5 p-5"
>
  <div className="grid gap-4 md:grid-cols-2">
    <label className="grid gap-2">
      <span className={labelClassName}>模型 API Base URL</span>
      <input className={inputClassName} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
    </label>
    <label className="grid gap-2">
      <span className={labelClassName}>模型名称</span>
      <input className={inputClassName} value={model} onChange={(event) => setModel(event.target.value)} />
    </label>
    <label className="grid gap-2">
      <span className={labelClassName}>并发数</span>
      <input
        aria-label="并发数"
        className={inputClassName}
        type="number"
        min={1}
        value={itemConcurrency}
        onChange={(event) => setItemConcurrency(event.target.value)}
      />
    </label>
    <label className="grid gap-2">
      <span className={labelClassName}>API Key 处理方式</span>
      <select className={inputClassName} value={apiKeyMode} onChange={(event) => setApiKeyMode(event.target.value as "keep" | "replace" | "clear")}>
        <option value="keep">保留当前 Key</option>
        <option value="replace">替换为新 Key</option>
        <option value="clear">清空 Key</option>
      </select>
    </label>
  </div>
</SectionCard>
```

- [ ] **Step 6: Keep settings behavior but reduce visual weight**

```tsx
const inputClassName =
  "min-h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 text-sm";
const textareaClassName =
  "min-h-[9rem] w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-sm leading-6";
```

- [ ] **Step 7: Run the monitor/settings tests and verify they pass**

Run:
```bash
npx vitest run tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx --reporter=dot
```

Expected:
- PASS

- [ ] **Step 8: Commit the admin density work**

```bash
git add src/components/admin/admin-monitor-panel.tsx src/components/admin/admin-settings-panel.tsx tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx
git commit -m "feat: restyle admin pages to match lumina"
```

### Task 5: Full Verification and Cleanup

**Files:**
- Test: `tests/unit/ui-style-imports.test.ts`
- Test: `tests/integration/feed-api.test.ts`

- [ ] **Step 1: Re-run the CSS-module regression test**

Run:
```bash
npx vitest run tests/unit/ui-style-imports.test.ts --reporter=dot
```

Expected:
- PASS

- [ ] **Step 2: Re-run all touched component suites**

Run:
```bash
npx vitest run tests/components/global-header.test.tsx tests/components/admin-login-form.test.tsx tests/components/content-review-panel.test.tsx tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx tests/components/feed-panel.test.tsx --reporter=dot
```

Expected:
- PASS

- [ ] **Step 3: Confirm the feed integration test keeps a fixed timer anchor**

```tsx
it("sorts the mixed feed by score when requested", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

  try {
    const { GET } = await import("@/app/api/feed/route");
    const response = await GET(new Request("http://localhost/api/feed?range=7d&sort=score_desc"));
    const json = await response.json();

    expect(json.items).toHaveLength(3);
    expect(json.sort).toBe("score_desc");
  } finally {
    vi.useRealTimers();
  }
});
```

Expected:
- 测试文件中保留固定 `SystemTime`
- 不会因为执行当日时间变化导致断言漂移

- [ ] **Step 4: Run lint**

Run:
```bash
npm run lint
```

Expected:
- PASS

- [ ] **Step 5: Run production build**

Run:
```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 6: Run the full test suite**

Run:
```bash
npm test
```

Expected:
- PASS，包含 Prisma 生成、测试数据库初始化与 Vitest 全量通过

- [ ] **Step 7: Commit final stabilization**

```bash
git add tests/unit/ui-style-imports.test.ts tests/integration/feed-api.test.ts
git commit -m "chore: verify lumina layout rollout"
```
