---
forge_loop: true
artifact: quick-task
slug: 实现公开html缓存isr和admin状态客户端化以提升匿名访客承载能力
status: done
mode: quick
blocking: false
---

# Quick Task: 实现公开html缓存isr和admin状态客户端化以提升匿名访客承载能力

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 实现公开HTML缓存ISR和admin状态客户端化以提升匿名访客承载能力 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 主页 `/` 和日报列表 `/daily` 不再在 SSR 阶段读取 admin session。
- 主页和日报列表默认输出匿名公开 HTML，并通过客户端 admin session hydration 恢复管理入口和管理操作。
- 为 `/` 和 `/daily` 增加公开 HTML CDN/反代缓存头。

## Out of Scope

- 保留 `/daily/[date]` 的动态 admin session 读取，避免破坏 admin 查看草稿详情、日报微调和发布/撤回语义。
- 不引入 CDN/Nginx/Redis/Postgres。

## Acceptance

- 匿名主页和日报列表不再依赖 server-side admin cookie。
- admin 登录用户仍能在客户端恢复管理入口和公开页管理按钮。
- `/` 和 `/daily` 响应具备共享缓存头。
- TypeScript、lint、build 和相关测试通过。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test / build |
| Command | `npx tsc --noEmit`; `npm run build`; targeted vitest |
| Failure Signal | 类型、构建或测试失败 |
| Determinism | deterministic |
| Re-run Plan | 重新运行 Commands Run 中的命令 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | N/A |
| Expected Behavior | N/A |
| Root Cause | N/A |
| Fix Hypothesis | N/A |
| Regression Validation | N/A |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `/` -> `FeedPanel` -> `PageShell` / `GlobalHeader`; `/daily` -> `DailyReportList` -> `PageShell` / `GlobalHeader`; admin state now hydrates via `/api/admin/session` |
| Architecture Candidates | Next build still marks `/` and `/daily` as dynamic because they depend on query/searchParams; explicit `Cache-Control` headers are therefore used for edge/反代 HTML reuse |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `next.config.ts`
- `src/app/page.tsx`
- `src/app/daily/page.tsx`
- `src/components/ui/global-header.tsx`
- `src/components/ui/page-shell.tsx`
- `src/components/ui/use-client-admin-session.ts`
- `src/components/feed/feed-panel.tsx`
- `src/components/feed/feed-panel.types.ts`
- `src/components/daily/daily-report-list.tsx`

## Execution

- 增加 `useClientAdminSession()`，按需从 `/api/admin/session` 客户端恢复 admin 状态。
- `GlobalHeader` / `PageShell` 增加 `resolveAdminClient`。
- `FeedPanel` 和 `DailyReportList` 增加 `hydrateAdminClient`。
- 主页移除 server-side `getAdminSession()`，设置 `revalidate = 30`，默认匿名渲染，客户端恢复 admin 控件。
- 日报列表移除 server-side `getAdminSession()`，设置 `revalidate = 300`，默认公开列表；admin hydration 后通过 `/api/daily` 加载 admin 可见列表。
- `next.config.ts` 为 `/` 和 `/daily` 增加 CDN/反代缓存头。

### Changed Files

| File | Change |
| --- | --- |
| `next.config.ts` | 增加 `/`、`/daily` HTML 缓存头 |
| `src/app/page.tsx` | 移除 SSR admin session，启用公开缓存/客户端 admin hydration |
| `src/app/daily/page.tsx` | 移除 SSR admin session，启用公开缓存/客户端 admin hydration |
| `src/components/ui/use-client-admin-session.ts` | 新增客户端 admin session hook |
| `src/components/ui/global-header.tsx` | 支持客户端恢复 admin 状态 |
| `src/components/ui/page-shell.tsx` | 透传客户端 admin 恢复配置 |
| `src/components/feed/feed-panel.tsx` | 支持客户端恢复 admin 操作区 |
| `src/components/feed/feed-panel.types.ts` | 增加 hydration prop |
| `src/components/daily/daily-report-list.tsx` | 支持客户端恢复 admin 列表数据和操作区 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "实现公开HTML缓存ISR和admin状态客户端化以提升匿名访客承载能力" --json` | pass | lane=quick, mode=quick |
| `npx tsc --noEmit` | pass | no output |
| `npx vitest run tests/components/global-header.test.tsx tests/components/page-shell.test.tsx tests/components/feed-panel.test.tsx tests/integration/feed-api.test.ts tests/integration/analytics-api.test.ts` | pass | 5 files, 81 tests passed |
| `npm run lint` | pass with warning | existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props` |
| `npm run build` | pass | `/` and `/daily` still show as dynamic SSR; cache headers handle edge reuse |

## Result

done

## Follow-ups

- 若要让 `/daily/[date]` 也公开缓存，需要先设计 admin 草稿详情/微调入口的替代路径，避免破坏管理语义。
- 部署层需要确保 CDN/Nginx honor `s-maxage`，且 `/admin/*` 和带 admin cookie 的请求不要错误共享缓存。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 生产是否有 CDN/Nginx | human | no | 本轮只加响应头和客户端化，部署策略后续处理 |

## Assumptions

- 高流量主要来自匿名公开访客。
- 公开 HTML 可以先以非 admin 状态输出，admin 控件允许客户端 hydration 后出现。

## Risks

- `/` 和 `/daily` 仍是动态 SSR，不是纯静态页面；收益依赖 CDN/反代是否缓存 `s-maxage`。
- Admin 在 `/daily` 首屏会先看到公开列表，客户端 session 确认后再加载 admin 视图。

## Validation

- `npx tsc --noEmit`
- `npx vitest run tests/components/global-header.test.tsx tests/components/page-shell.test.tsx tests/components/feed-panel.test.tsx tests/integration/feed-api.test.ts tests/integration/analytics-api.test.ts`
- `npm run lint`
- `npm run build`
- Completion claim is based on the fresh command results in Commands Run.
