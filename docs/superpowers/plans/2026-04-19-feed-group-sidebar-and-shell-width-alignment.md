# Feed Group Sidebar And Shell Width Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `infinitum` 的全局 Header 与页面内容区宽度统一放宽到接近 Lumina 的 `max-w-7xl` 基线，并将首页“分组筛选”改造成 Lumina 风格的左侧侧边栏入口。

**Architecture:** 继续沿用现有 `PageShell -> GlobalHeader -> FeedPanel` 结构，不改 API 与筛选参数，只调整壳层宽度和首页筛选入口。首页通过 `FeedPanel` 内部新增侧边栏状态和侧栏 UI 来承载分组筛选，同时删掉高级筛选中的分组下拉，避免双入口。

**Tech Stack:** Next.js App Router, React client components, Tailwind utility classes, Vitest, Testing Library

---

### Task 1: 放宽全局 Header 与页面工作区版心

**Files:**
- Modify: `src/components/ui/global-header.tsx`
- Modify: `src/components/ui/page-shell.tsx`
- Modify: `tests/components/global-header.test.tsx`
- Create: `tests/components/page-shell.test.tsx`

- [ ] **Step 1: 为 Header 宽度写失败测试**

```tsx
it("uses the wider Lumina-like max width shell", () => {
  render(<GlobalHeader activeNav="home" isAdmin={false} />);

  const shell = screen.getByRole("navigation", { name: "主导航" }).parentElement;

  expect(shell).not.toBeNull();
  expect(shell?.className).toContain("max-w-7xl");
  expect(shell?.className).not.toContain("max-w-6xl");
});
```

- [ ] **Step 2: 为 PageShell 宽度写失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageShell } from "@/components/ui/page-shell";

describe("PageShell", () => {
  it("uses the wider default content width", () => {
    const { container } = render(
      <PageShell header={{ activeNav: "home", isAdmin: false }}>
        <div>content</div>
      </PageShell>,
    );

    const contentShell = container.querySelector("main > div:last-child");

    expect(contentShell?.className).toContain("max-w-7xl");
    expect(contentShell?.className).not.toContain("max-w-6xl");
  });

  it("keeps the workspace width mode for admin workspaces", () => {
    const { container } = render(
      <PageShell header={{ activeNav: "monitor", isAdmin: true }} contentWidth="workspace">
        <div>content</div>
      </PageShell>,
    );

    const contentShell = container.querySelector("main > div:last-child");

    expect(contentShell?.className).toContain("max-w-[92rem]");
  });
});
```

- [ ] **Step 3: 运行测试，确认当前实现失败**

Run:

```bash
npm run test -- tests/components/global-header.test.tsx tests/components/page-shell.test.tsx
```

Expected:

```text
FAIL  tests/components/global-header.test.tsx
FAIL  tests/components/page-shell.test.tsx
AssertionError: expected className to contain "max-w-7xl"
```

- [ ] **Step 4: 修改 `GlobalHeader` 与 `PageShell` 的宽度基线**

```tsx
// src/components/ui/global-header.tsx
return (
  <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[color:var(--surface-overlay)]/92 backdrop-blur-xl">
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
    </div>
  </header>
);

// src/components/ui/page-shell.tsx
<div
  className={cx(
    "mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
    contentWidth === "workspace" ? "max-w-[92rem]" : "max-w-7xl",
    contentClassName,
  )}
>
```

- [ ] **Step 5: 运行测试，确认宽度基线已通过**

Run:

```bash
npm run test -- tests/components/global-header.test.tsx tests/components/page-shell.test.tsx
```

Expected:

```text
PASS  tests/components/global-header.test.tsx
PASS  tests/components/page-shell.test.tsx
```

- [ ] **Step 6: 提交这一组壳层宽度改动**

```bash
git add src/components/ui/global-header.tsx src/components/ui/page-shell.tsx tests/components/global-header.test.tsx tests/components/page-shell.test.tsx
git commit -m "feat: widen shared shell layout to lumina baseline"
```

### Task 2: 将首页分组筛选改成左侧侧边栏入口

**Files:**
- Modify: `src/components/feed/feed-panel.tsx`

- [ ] **Step 1: 为分组侧栏结构写失败测试**

```tsx
it("renders the homepage with a Lumina-like group sidebar and no duplicate group select", async () => {
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
      availableGroups={[
        { id: "group-1", name: "AI 快讯" },
        { id: "group-2", name: "工程实践" },
      ]}
    />,
  );

  expect(screen.getByRole("complementary", { name: "分组筛选" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "收起分组筛选" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "全部分组" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "AI 快讯" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "高级筛选" }));
  expect(screen.queryByLabelText("分组")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 为侧栏切换筛选写失败测试**

```tsx
it("applies group filtering from the sidebar and keeps source filtering linked", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [initialEntries[1]],
        pagination: { page: 1, size: 20, total: 1, totalPages: 1 },
        range: "7d",
        sort: "time_desc",
        start: null,
        end: null,
        groupId: "group-1",
        sourceId: null,
        title: null,
      }),
    ),
  );

  vi.stubGlobal("fetch", fetchMock);

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
      availableGroups={[
        { id: "group-1", name: "AI 快讯" },
        { id: "group-2", name: "工程实践" },
      ]}
      availableSources={[
        { id: "source-1", name: "Source A", groupId: "group-1" },
        { id: "source-2", name: "Source B", groupId: "group-2" },
      ]}
    />,
  );

  await user.click(screen.getByRole("button", { name: "AI 快讯" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=7d&sort=time_desc&groupId=group-1&tzOffsetMinutes=-480");
  });

  expect(screen.getByText("分组：AI 快讯")).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试，确认当前实现失败**

Run:

```bash
npm run test -- tests/components/feed-panel.test.tsx
```

Expected:

```text
FAIL  tests/components/feed-panel.test.tsx
TestingLibraryElementError: Unable to find role "complementary" with name "分组筛选"
```

- [ ] **Step 4: 在 `FeedPanel` 中加入侧栏状态、侧栏 UI 和更贴近 Lumina 的双栏布局**

```tsx
// src/components/feed/feed-panel.tsx
const [groupSidebarCollapsed, setGroupSidebarCollapsed] = useState(false);

const feedGroupSidebar = (
  <aside
    aria-label="分组筛选"
    className={cx(
      "hidden lg:block w-full flex-shrink-0 transition-all duration-300",
      groupSidebarCollapsed ? "lg:w-12" : "lg:w-56",
    )}
  >
    <div className="panel-raised rounded-sm border border-[color:var(--line)] p-4 lg:sticky lg:top-4">
      <div className="mb-4 flex items-center justify-between">
        {!groupSidebarCollapsed ? (
          <h2 className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <TagIcon className="h-4 w-4" />
            <span>分组筛选</span>
          </h2>
        ) : null}
        <button
          type="button"
          aria-label={groupSidebarCollapsed ? "展开分组筛选" : "收起分组筛选"}
          title={groupSidebarCollapsed ? "展开" : "收起"}
          className="text-[var(--text-3)] transition hover:text-[var(--text-2)]"
          onClick={() => setGroupSidebarCollapsed((current) => !current)}
        >
          {groupSidebarCollapsed ? "»" : "«"}
        </button>
      </div>
      {!groupSidebarCollapsed ? (
        <div className="space-y-2">
          <button
            type="button"
            aria-pressed={!groupId}
            className={cx(
              "block w-full rounded-sm px-3 py-2 text-left transition",
              !groupId ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "hover:bg-[var(--surface-muted)]",
            )}
            onClick={() => changeGroup("")}
          >
            全部分组
          </button>
          {availableGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={groupId === group.id}
              className={cx(
                "block w-full rounded-sm px-3 py-2 text-left transition",
                groupId === group.id ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "hover:bg-[var(--surface-muted)]",
              )}
              onClick={() => changeGroup(group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  </aside>
);

<PageShell header={{ activeNav: "home", isAdmin }} sidebar={feedGroupSidebar} contentClassName="gap-5 sm:gap-6">
```

- [ ] **Step 5: 删除高级筛选中的分组下拉，保留来源与标题搜索**

```tsx
// remove this block from the advanced filters grid:
<FilterSelect
  id="feed-group-filter"
  label="分组"
  ariaLabel="分组"
  value={groupId ?? ""}
  onChange={changeGroup}
  showSearch={false}
  options={[
    { value: "", label: "全部分组" },
    ...availableGroups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ]}
/>
```

- [ ] **Step 6: 为移动端补一个轻量降级入口**

```tsx
// src/components/feed/feed-panel.tsx
const renderGroupButtons = (className: string) => (
  <>
    <button
      type="button"
      aria-pressed={!groupId}
      className={cx(className, !groupId ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "hover:bg-[var(--surface-muted)]")}
      onClick={() => changeGroup("")}
    >
      全部分组
    </button>
    {availableGroups.map((group) => (
      <button
        key={group.id}
        type="button"
        aria-pressed={groupId === group.id}
        className={cx(
          className,
          groupId === group.id ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "hover:bg-[var(--surface-muted)]",
        )}
        onClick={() => changeGroup(group.id)}
      >
        {group.name}
      </button>
    ))}
  </>
);

<section className="panel-raised rounded-sm border border-[color:var(--line)] p-4 lg:hidden">
  <button
    type="button"
    aria-expanded={mobileGroupOpen}
    className="flex w-full items-center justify-between text-sm text-[var(--foreground)]"
    onClick={() => setMobileGroupOpen((current) => !current)}
  >
    <span>分组筛选</span>
    <span>{mobileGroupOpen ? "收起" : "展开"}</span>
  </button>
  {mobileGroupOpen ? (
    <div className="mt-3 flex flex-wrap gap-2">
      {renderGroupButtons("rounded-sm px-3 py-2 text-sm transition")}
    </div>
  ) : null}
</section>
```

- [ ] **Step 7: 运行测试，确认侧栏与筛选联动通过**

Run:

```bash
npm run test -- tests/components/feed-panel.test.tsx
```

Expected:

```text
PASS  tests/components/feed-panel.test.tsx
```

- [ ] **Step 8: 提交首页侧栏与筛选入口改动**

```bash
git add src/components/feed/feed-panel.tsx tests/components/feed-panel.test.tsx
git commit -m "feat: align homepage group filter with lumina sidebar"
```

### Task 3: 全量验证首页与后台页在更宽版心下仍可工作

**Files:**
- Modify: `tests/components/admin-monitor-panel.test.tsx`
- Modify: `tests/components/feed-panel.test.tsx`

- [ ] **Step 1: 为后台页宽度对齐补充失败测试**

```tsx
it("renders the monitor workspace inside the wider shared shell", () => {
  const { container } = render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

  const headerShell = screen.getByRole("navigation", { name: "主导航" }).parentElement;
  const mainShell = container.querySelector("main > div:last-child");

  expect(headerShell?.className).toContain("max-w-7xl");
  expect(mainShell?.className).toContain("max-w-[92rem]");
});
```

- [ ] **Step 2: 为首页双栏骨架补充断言**

```tsx
it("renders the homepage content inside the wider shell and sidebar grid", () => {
  const { container } = render(
    <FeedPanel
      initialItems={initialEntries}
      initialRange="7d"
      initialSort="time_desc"
      initialStartDate={null}
      initialEndDate={null}
      initialNextCursor={null}
      initialStatus={null}
      isAdmin={false}
      availableGroups={[{ id: "group-1", name: "AI 快讯" }]}
    />,
  );

  expect(container.querySelector(".xl\\:grid-cols-\\[240px_minmax\\(0\\,1fr\\)\\]")).not.toBeNull();
  expect(screen.getByRole("complementary", { name: "分组筛选" })).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行组件测试，确认所有布局回归都通过**

Run:

```bash
npm run test -- tests/components/global-header.test.tsx tests/components/page-shell.test.tsx tests/components/feed-panel.test.tsx tests/components/admin-monitor-panel.test.tsx
```

Expected:

```text
PASS  tests/components/global-header.test.tsx
PASS  tests/components/page-shell.test.tsx
PASS  tests/components/feed-panel.test.tsx
PASS  tests/components/admin-monitor-panel.test.tsx
```

- [ ] **Step 4: 运行生产构建，确认 Next.js 页面壳和首页都能通过**

Run:

```bash
npm run build
```

Expected:

```text
✓ Compiled successfully
✓ Generating static pages
```

- [ ] **Step 5: 提交验证与回归测试补充**

```bash
git add tests/components/admin-monitor-panel.test.tsx tests/components/feed-panel.test.tsx
git commit -m "test: cover lumina-aligned shell and feed sidebar layout"
```
