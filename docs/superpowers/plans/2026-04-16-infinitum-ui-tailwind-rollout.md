# Infinitum UI Tailwind Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `infinitum` 中接入适配 Next.js 16 的 Tailwind，并把首页与后台四个页面迁移到统一的 `lumina` 风格产品界面，同时保持现有功能与测试行为稳定。

**Architecture:** 保留 App Router、数据流和现有 API；用 `@tailwindcss/postcss` + `src/app/globals.css` 建立 Tailwind 基线；引入少量共享 UI primitive 统一页面壳层与消息样式；按“登录页/首页/后台页/清理”顺序渐进迁移，始终依赖现有 Vitest 组件测试与最终的 lint/build/test 做回归保护。

**Tech Stack:** Next.js 16.2.3, React 19, Tailwind CSS, PostCSS, Vitest, Testing Library, ESLint

---

## File Structure

**Create:**

- `postcss.config.mjs` - 启用 `@tailwindcss/postcss`
- `src/lib/ui/cx.ts` - 轻量 class 拼接工具
- `src/components/ui/page-shell.tsx` - 统一页面容器
- `src/components/ui/page-header.tsx` - 统一页面头部
- `src/components/ui/status-banner.tsx` - 成功/失败消息条
- `tests/unit/ui-style-imports.test.ts` - 约束迁移后的页面不再依赖旧 CSS Modules

**Modify:**

- `package.json` - 增加 Tailwind 依赖
- `src/app/globals.css` - 导入 Tailwind，定义全局 token 和基础样式
- `src/components/feed/feed-panel.tsx` - 首页 Tailwind 迁移
- `src/components/admin/admin-login-form.tsx` - 登录页 Tailwind 迁移
- `src/components/admin/content-review-panel.tsx` - 内容审核页 Tailwind 迁移
- `src/components/admin/admin-monitor-panel.tsx` - 任务监控页 Tailwind 迁移
- `src/components/admin/admin-settings-panel.tsx` - 后台设置页 Tailwind 迁移
- `tests/components/feed-panel.test.tsx` - 首页新壳层与行为断言
- `tests/components/admin-login-form.test.tsx` - 登录页新壳层断言
- `tests/components/content-review-panel.test.tsx` - 内容审核页新结构断言
- `tests/components/admin-monitor-panel.test.tsx` - 监控页新结构断言
- `tests/components/admin-settings-panel.test.tsx` - 设置页新结构断言

**Delete:**

- `src/components/feed/feed-panel.module.css`
- `src/components/admin/admin.module.css`

## Task 1: Tailwind 基础设施与登录页壳层

**Files:**

- Create: `postcss.config.mjs`
- Create: `src/lib/ui/cx.ts`
- Create: `src/components/ui/page-shell.tsx`
- Create: `src/components/ui/page-header.tsx`
- Create: `src/components/ui/status-banner.tsx`
- Modify: `package.json`
- Modify: `src/app/globals.css`
- Modify: `src/components/admin/admin-login-form.tsx`
- Test: `tests/components/admin-login-form.test.tsx`

- [ ] **Step 1: 先写登录页新壳层的失败测试**

```tsx
it("renders the new console shell before login", () => {
  render(<AdminLoginForm />);

  expect(screen.getByText("Infinitum Console")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "管理员登录" })).toBeInTheDocument();
  expect(screen.getByText("后台访问受密码保护，登录后可管理抓取、审核与配置。")).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑这个测试，确认它先失败**

Run: `npx vitest run tests/components/admin-login-form.test.tsx --reporter=dot`

Expected: FAIL，提示找不到 `Infinitum Console` 或新的说明文案。

- [ ] **Step 3: 安装 Tailwind 依赖并更新 `package.json`**

```json
{
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "tailwindcss": "^4.1.0"
  }
}
```

Run: `npm install`

Expected: `package-lock.json` 更新，安装成功无 peer dependency 错误。

- [ ] **Step 4: 新建 PostCSS 配置**

```js
// postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 5: 用 Tailwind 重写全局基础样式和 token**

```css
/* src/app/globals.css */
@import "tailwindcss";

:root {
  --bg-app: #f5f7fb;
  --bg-surface: #ffffff;
  --bg-muted: #eef2f8;
  --text-1: #111827;
  --text-2: #475467;
  --text-3: #667085;
  --border: #d9e2f0;
  --border-strong: #b9c6da;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --accent-ink: #1d4ed8;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
  --radius-sm: 10px;
  --radius-md: 18px;
  --shadow-sm: 0 8px 24px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 20px 50px rgba(15, 23, 42, 0.10);
  --font-sans: "PingFang SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SFMono-Regular", "JetBrains Mono", monospace;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top, rgba(37, 99, 235, 0.08), transparent 30%),
    var(--bg-app);
  color: var(--text-1);
  font-family: var(--font-sans);
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 6: 新建共享 UI primitive**

```ts
// src/lib/ui/cx.ts
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
```

```tsx
// src/components/ui/page-shell.tsx
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="page-shell"
      className={cx("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10", className)}
    >
      {children}
    </section>
  );
}
```

```tsx
// src/components/ui/page-header.tsx
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-6 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent-ink)]">
            {eyebrow}
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--text-1)] sm:text-4xl">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-[color:var(--text-2)] sm:text-base">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
```

```tsx
// src/components/ui/status-banner.tsx
export function StatusBanner({
  tone,
  message,
}: {
  tone: "default" | "success" | "danger";
  message: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-[color:var(--border)] bg-[color:var(--bg-muted)] text-[color:var(--text-2)]";

  return <p className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>{message}</p>;
}
```

- [ ] **Step 7: 用新 primitive 把登录页改成 Tailwind 壳层**

```tsx
// src/components/admin/admin-login-form.tsx
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";

export function AdminLoginForm() {
  // 保留现有状态与 submit 逻辑
  return (
    <PageShell className="flex min-h-[calc(100vh-4rem)] items-center">
      <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <PageHeader
          eyebrow="Infinitum Console"
          title="管理员登录"
          description="后台访问受密码保护，登录后可管理抓取、审核与配置。"
        />
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-6 shadow-[var(--shadow-sm)]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[color:var(--text-2)]">管理员密码</span>
            <input
              className="h-11 rounded-xl border border-[color:var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-blue-100"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message ? <StatusBanner tone="danger" message={message} /> : null}
          <button
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[color:var(--accent)] px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={submit}
            disabled={isPending || !password.trim()}
          >
            {isPending ? "登录中..." : "登录"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 8: 重新跑登录页测试**

Run: `npx vitest run tests/components/admin-login-form.test.tsx --reporter=dot`

Expected: PASS

- [ ] **Step 9: 跑 lint 和 build 烟雾验证**

Run: `npm run lint`

Expected: PASS

Run: `npm run build`

Expected: PASS，Next.js 构建完成，确认 Tailwind/PostCSS 配置工作正常。

- [ ] **Step 10: 提交这一批基础设施**

```bash
git add package.json package-lock.json postcss.config.mjs src/app/globals.css src/lib/ui/cx.ts src/components/ui/page-shell.tsx src/components/ui/page-header.tsx src/components/ui/status-banner.tsx src/components/admin/admin-login-form.tsx tests/components/admin-login-form.test.tsx
git commit -m "feat: add tailwind foundation and login shell"
```

## Task 2: 首页信息流迁移到 Tailwind

**Files:**

- Modify: `src/components/feed/feed-panel.tsx`
- Modify: `tests/components/feed-panel.test.tsx`
- Test: `tests/components/feed-panel.test.tsx`

- [ ] **Step 1: 先给首页加新壳层断言**

```tsx
it("renders the new feed workspace shell", () => {
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

  expect(screen.getByText("Infinitum Feed")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "信息流控制台" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "信息流筛选" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑首页测试，确认先失败**

Run: `npx vitest run tests/components/feed-panel.test.tsx --reporter=dot`

Expected: FAIL，提示缺少 `Infinitum Feed` 或 `信息流控制台`。

- [ ] **Step 3: 删除 `styles` 依赖，改用 Tailwind 页面壳层**

```tsx
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import { cx } from "@/lib/ui/cx";
```

```tsx
return (
  <PageShell className="space-y-6">
    <PageHeader
      eyebrow="Infinitum Feed"
      title="信息流控制台"
      description="用 AI 过滤低价值信息、折叠同主题事件，并把审核与抓取入口集中到同一工作台。"
      actions={headerActions}
    />
    <section
      aria-label="信息流筛选"
      className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]"
    >
      {/* 时间范围、排序、筛选、日期区块 */}
    </section>
    {refreshMessage ? <StatusBanner tone="default" message={refreshMessage} /> : null}
    <div className="space-y-4">{renderedCards}</div>
  </PageShell>
);
```

- [ ] **Step 4: 用 Tailwind 迁移筛选栏与摘要卡**

```tsx
const quickRangeClass =
  "inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition";

const metaCardClass =
  "rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-muted)] px-4 py-3 text-sm text-[color:var(--text-2)]";
```

```tsx
<div className="flex flex-wrap gap-2" role="tablist" aria-label="时间范围">
  {RANGE_OPTIONS.map((option) => {
    const active = !startDate && !endDate && option.value === range;
    return (
      <button
        key={option.value}
        className={cx(
          quickRangeClass,
          active
            ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
            : "border-[color:var(--border)] bg-white text-[color:var(--text-2)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent-ink)]",
        )}
        type="button"
        onClick={() => loadRange(option.value)}
      >
        {option.label}
      </button>
    );
  })}
</div>
```

- [ ] **Step 5: 用 Tailwind 迁移单条卡与聚合卡**

```tsx
const cardClass =
  "rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]";
```

```tsx
<article className={cardClass}>
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs font-medium text-[color:var(--text-3)]">
        <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-[color:var(--accent-ink)]">
          {entry.type === "cluster" ? `事件 ${entry.itemCount}` : entry.sourceName}
        </span>
        <span>{formatDate(entry.latestPublishedAt)}</span>
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-[color:var(--text-1)] sm:text-2xl">
        {entry.type === "cluster" ? entry.title : <a href={entry.originalUrl}>{entry.title}</a>}
      </h2>
      <p className="max-w-4xl text-sm leading-6 text-[color:var(--text-2)] sm:text-base">{entry.summary}</p>
    </div>
    <div className="grid gap-2 sm:min-w-40">
      <span className="rounded-full border border-[color:var(--border)] px-3 py-1 text-center text-xs font-semibold text-[color:var(--text-2)]">
        质量 {entry.type === "cluster" ? entry.score : entry.score}
      </span>
    </div>
  </div>
</article>
```

- [ ] **Step 6: 把聚合展开区改成嵌套面板**

```tsx
{entry.type === "cluster" && openClusters[entry.id] ? (
  <div className="mt-4 grid gap-3 rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg-muted)] p-4">
    {expandedClusters[entry.id]?.map((item) => (
      <div key={item.id} className="rounded-xl border border-[color:var(--border)] bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <a className="text-sm font-semibold text-[color:var(--text-1)] hover:text-[color:var(--accent-ink)]" href={item.originalUrl}>
            {item.title}
          </a>
          <span className="text-xs text-[color:var(--text-3)]">{item.sourceName}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-2)]">{item.summary}</p>
      </div>
    ))}
  </div>
) : null}
```

- [ ] **Step 7: 重新跑首页测试**

Run: `npx vitest run tests/components/feed-panel.test.tsx --reporter=dot`

Expected: PASS

- [ ] **Step 8: 提交首页迁移**

```bash
git add src/components/feed/feed-panel.tsx tests/components/feed-panel.test.tsx
git commit -m "feat: migrate feed workspace to tailwind"
```

## Task 3: 内容审核页迁移到 Tailwind

**Files:**

- Modify: `src/components/admin/content-review-panel.tsx`
- Modify: `tests/components/content-review-panel.test.tsx`
- Test: `tests/components/content-review-panel.test.tsx`

- [ ] **Step 1: 先给内容审核页加新结构断言**

```tsx
it("renders the review workspace shell", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ items: [], clusters: [] }))),
  );

  render(<ContentReviewPanel />);

  expect(screen.getByText("Content Review")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "内容审核工作台" })).toBeInTheDocument();
  expect(screen.getByRole("tablist", { name: "内容审核视图" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑内容审核测试，确认先失败**

Run: `npx vitest run tests/components/content-review-panel.test.tsx --reporter=dot`

Expected: FAIL，提示缺少新的标题或 `tablist` 名称。

- [ ] **Step 3: 用共享壳层改写页面头和 tab**

```tsx
return (
  <PageShell className="space-y-6">
    <PageHeader
      eyebrow="Content Review"
      title="内容审核工作台"
      description="集中处理被过滤内容、聚合结果和人工干预动作。"
      actions={navActions}
    />
    <div
      role="tablist"
      aria-label="内容审核视图"
      className="inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-1 shadow-[var(--shadow-sm)]"
    >
      {/* 两个 tab 按钮 */}
    </div>
    {message ? <StatusBanner tone="default" message={message} /> : null}
    {activeTab === "filtered" ? <FilteredReviewList /> : <ClusterReviewList />}
  </PageShell>
);
```

- [ ] **Step 4: 把审核卡片改成统一的后台卡片布局**

```tsx
<article className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-[color:var(--text-1)]">{item.title}</h3>
      <p className="text-sm text-[color:var(--text-3)]">
        {item.sourceName} · {new Date(item.publishedAt).toLocaleString("zh-CN")}
      </p>
      <p className="text-sm leading-6 text-[color:var(--text-2)]">{item.summary}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        {item.moderationReason ?? "filtered"}
      </span>
      <span className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-medium text-[color:var(--accent-ink)]">
        质量 {item.qualityScore}
      </span>
    </div>
  </div>
</article>
```

- [ ] **Step 5: 重新跑内容审核测试**

Run: `npx vitest run tests/components/content-review-panel.test.tsx --reporter=dot`

Expected: PASS

- [ ] **Step 6: 提交内容审核页迁移**

```bash
git add src/components/admin/content-review-panel.tsx tests/components/content-review-panel.test.tsx
git commit -m "feat: migrate content review workspace to tailwind"
```

## Task 4: 任务监控页与后台设置页迁移到 Tailwind

**Files:**

- Modify: `src/components/admin/admin-monitor-panel.tsx`
- Modify: `src/components/admin/admin-settings-panel.tsx`
- Modify: `tests/components/admin-monitor-panel.test.tsx`
- Modify: `tests/components/admin-settings-panel.test.tsx`
- Test: `tests/components/admin-monitor-panel.test.tsx`
- Test: `tests/components/admin-settings-panel.test.tsx`

- [ ] **Step 1: 先给监控页和设置页加新区域断言**

```tsx
// tests/components/admin-monitor-panel.test.tsx
expect(screen.getByRole("region", { name: "调度设置" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "运行中任务" })).toBeInTheDocument();
```

```tsx
// tests/components/admin-settings-panel.test.tsx
expect(screen.getByRole("region", { name: "基础配置" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "信息源管理" })).toBeInTheDocument();
```

- [ ] **Step 2: 跑这两个测试，确认先失败**

Run: `npx vitest run tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx --reporter=dot`

Expected: FAIL，提示缺少命名 region。

- [ ] **Step 3: 迁移监控页头部、调度卡和任务卡**

```tsx
<PageShell className="space-y-6">
  <PageHeader
    eyebrow="Task Monitor"
    title="任务监控"
    description="查看默认抓取调度、运行中任务和最近任务执行结果。"
    actions={navActions}
  />
  {message ? <StatusBanner tone="default" message={message} /> : null}
  <section
    aria-label="调度设置"
    className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]"
  >
    {/* 调度配置表单 */}
  </section>
</PageShell>
```

```tsx
<section aria-label="运行中任务" className="grid gap-4">
  {snapshot.runningTasks.map((task) => (
    <article key={task.id} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[color:var(--text-1)]">{task.label}</h3>
          <p className="text-sm text-[color:var(--text-3)]">{task.triggerType} · {task.status}</p>
          <p className="text-sm leading-6 text-[color:var(--text-2)]">{task.progressLabel ?? "等待处理"}</p>
        </div>
      </div>
    </article>
  ))}
</section>
```

- [ ] **Step 4: 迁移设置页头部和四个 section 卡片**

```tsx
<PageShell className="space-y-6">
  <PageHeader
    eyebrow="Settings"
    title="后台设置"
    description="所有修改会直接写入数据库，并影响抓取、分析和聚合流程。"
    actions={navActions}
  />
  {message ? <StatusBanner tone="default" message={message} /> : null}
  <section
    aria-label="基础配置"
    className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]"
  >
    {/* baseUrl / model / prompts */}
  </section>
  <section
    aria-label="信息源管理"
    className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]"
  >
    {/* OPML、信息源创建、列表编辑 */}
  </section>
</PageShell>
```

- [ ] **Step 5: 把设置页表单控件统一成 Tailwind class 常量**

```tsx
const inputClass =
  "h-11 rounded-xl border border-[color:var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-blue-100";
const textareaClass =
  "min-h-36 rounded-2xl border border-[color:var(--border)] bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-blue-100";
const primaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-xl bg-[color:var(--accent)] px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";
```

- [ ] **Step 6: 重新跑监控页和设置页测试**

Run: `npx vitest run tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx --reporter=dot`

Expected: PASS

- [ ] **Step 7: 提交监控页与设置页迁移**

```bash
git add src/components/admin/admin-monitor-panel.tsx src/components/admin/admin-settings-panel.tsx tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx
git commit -m "feat: migrate admin monitor and settings to tailwind"
```

## Task 5: 清理旧 CSS Modules 并做全量验证

**Files:**

- Create: `tests/unit/ui-style-imports.test.ts`
- Delete: `src/components/feed/feed-panel.module.css`
- Delete: `src/components/admin/admin.module.css`
- Test: `tests/unit/ui-style-imports.test.ts`

- [ ] **Step 1: 先写防回退测试，禁止已迁移页面继续引用旧 CSS Modules**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/feed/feed-panel.tsx",
  "src/components/admin/admin-login-form.tsx",
  "src/components/admin/content-review-panel.tsx",
  "src/components/admin/admin-monitor-panel.tsx",
  "src/components/admin/admin-settings-panel.tsx",
];

describe("ui style imports", () => {
  it("does not import legacy page css modules", () => {
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/feed-panel\.module\.css|admin\.module\.css/);
    }
  });
});
```

- [ ] **Step 2: 跑这个测试，确认先失败**

Run: `npx vitest run tests/unit/ui-style-imports.test.ts --reporter=dot`

Expected: FAIL，如果前面任务仍然保留旧 import，会被这个测试抓出来。

- [ ] **Step 3: 删除旧 CSS Module 文件并清理残留 import**

```bash
rm src/components/feed/feed-panel.module.css
rm src/components/admin/admin.module.css
```

同时确认以下 import 均已删除：

```tsx
import styles from "@/components/feed/feed-panel.module.css";
import styles from "@/components/admin/admin.module.css";
```

- [ ] **Step 4: 跑清理测试**

Run: `npx vitest run tests/unit/ui-style-imports.test.ts --reporter=dot`

Expected: PASS

- [ ] **Step 5: 跑全量组件测试**

Run: `npx vitest run tests/components/admin-login-form.test.tsx tests/components/content-review-panel.test.tsx tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx tests/components/feed-panel.test.tsx`

Expected: PASS

- [ ] **Step 6: 跑 lint、build 和全量测试**

Run: `npm run lint`

Expected: PASS

Run: `npm run build`

Expected: PASS

Run: `npm test`

Expected: PASS，包含 Prisma 生成、测试数据库初始化和 Vitest 全量通过。

- [ ] **Step 7: 提交收尾清理**

```bash
git add docs/superpowers/plans/2026-04-16-infinitum-ui-tailwind-rollout.md tests/unit/ui-style-imports.test.ts src/components/feed/feed-panel.tsx src/components/admin/admin-login-form.tsx src/components/admin/content-review-panel.tsx src/components/admin/admin-monitor-panel.tsx src/components/admin/admin-settings-panel.tsx tests/components/feed-panel.test.tsx tests/components/admin-login-form.test.tsx tests/components/content-review-panel.test.tsx tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx src/app/globals.css package.json package-lock.json postcss.config.mjs src/lib/ui/cx.ts src/components/ui/page-shell.tsx src/components/ui/page-header.tsx src/components/ui/status-banner.tsx
git add -u src/components/feed/feed-panel.module.css src/components/admin/admin.module.css
git commit -m "feat: complete tailwind ui migration"
```
