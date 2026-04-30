---
forge_loop: true
artifact: quick-task
slug: 优化p0和p1-匿名公开feed共享缓存-并降级pv-uv实时统计成本
status: done
mode: quick
blocking: false
---

# Quick Task: 优化p0和p1-匿名公开feed共享缓存-并降级pv-uv实时统计成本

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 优化P0和P1：匿名公开feed共享缓存，并降级PV/UV实时统计成本 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 公开首页和 `/api/feed` 不再为匿名 feed 列表创建或使用 visitor cookie。
- Feed 列表缓存键去掉 visitorId，提高匿名公开访问的共享缓存命中率。
- `/api/feed` 改为可由共享缓存层短 TTL 缓存。
- PV/UV 接口保留写入，但对同访客同路径重复写入做短窗口去重，并缓存统计查询结果。

## Out of Scope

- 不引入 Redis / Postgres / CDN 配置。
- 不重构 feed read model。
- 不改变投票接口本身；投票后当前页面仍用接口响应即时更新按钮状态。

## Acceptance

- 匿名 feed 请求不设置 visitor cookie。
- `/api/feed` 返回公开短 TTL 缓存头。
- 重复 PV/UV 上报不会在短窗口内重复写入，也不会每次重新执行 count/groupBy。
- TypeScript、lint 和针对性测试通过。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test / CLI |
| Command | `npx vitest run tests/integration/feed-api.test.ts tests/integration/analytics-api.test.ts` |
| Failure Signal | 测试失败或类型/lint 失败 |
| Determinism | deterministic |
| Re-run Plan | 重新运行 targeted vitest、`npx tsc --noEmit`、`npm run lint` |

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
| Module Map | `/` -> `getCachedFeedItems()`；`/api/feed` -> `getCachedFeedItems()`；`/api/track-page-view` -> `recordPageView()` + `getPageViewStats()` |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/app/page.tsx`
- `src/app/api/feed/route.ts`
- `src/lib/feed/service.ts`
- `src/lib/analytics/repository.ts`
- `src/config/constants.ts`
- `tests/integration/feed-api.test.ts`
- `tests/integration/analytics-api.test.ts`

## Execution

- 移除首页和 feed API 对 `getVisitorIdCookie()` 的依赖。
- 从 feed cache key 中移除 `visitorId`，并让 loader 调用匿名 feed 查询。
- 为 `/api/feed` 增加 `public, s-maxage=30, stale-while-revalidate=300`。
- 在 analytics repository 中增加进程内 stats cache 和重复写入 dedupe map。
- 增加集成测试覆盖公开缓存头、不设置 cookie、PV/UV 写入去重和统计缓存。

### Changed Files

| File | Change |
| --- | --- |
| `src/app/page.tsx` | 首页首屏 feed 不再创建 visitor cookie |
| `src/app/api/feed/route.ts` | Feed API 不再读取 visitor cookie，并返回公开短 TTL 缓存头 |
| `src/lib/feed/service.ts` | Feed 列表缓存键去掉 visitorId |
| `src/lib/analytics/repository.ts` | PV/UV 统计查询缓存；同访客同路径短窗口重复写入去重 |
| `src/config/constants.ts` | 增加 analytics TTL / dedupe 常量 |
| `tests/integration/feed-api.test.ts` | 覆盖公开缓存头和不设置 cookie |
| `tests/integration/analytics-api.test.ts` | 覆盖重复 PV/UV 上报的写入去重和统计缓存 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "优化P0和P1：匿名公开feed共享缓存，并降级PV/UV实时统计成本" --json` | pass | lane=quick, mode=quick, risk=low |
| `npx vitest run tests/integration/feed-api.test.ts tests/integration/analytics-api.test.ts` | pass | 2 files, 21 tests passed |
| `npx tsc --noEmit` | pass | no output |
| `npm run lint` | pass with warning | existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props` |
| `npx @shawnxie666/forge-loop validate --slug "优化p0和p1-匿名公开feed共享缓存-并降级pv-uv实时统计成本"` | pass | workflow artifact validation passed |

## Result

done

## Follow-ups

- 如需恢复“刷新列表后仍高亮当前访客已投票状态”，可单独增加轻量 vote-status hydration，而不是把 visitorId 放回 feed 列表缓存键。
- 如果 PV 必须精确实时，后续应改为聚合表或队列批量写入；当前实现是短期降成本方案。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否允许后续引入 Redis/CDN 配置 | human | no | 本轮不需要 |

## Assumptions

- Feed 首屏可以不展示当前访客历史投票高亮；投票动作后当前卡片仍即时更新。
- PV/UV 允许最长 5 分钟统计陈旧，同一访客同一路径 30 分钟内重复访问可以去重。

## Risks

- 已投票访客刷新 feed 后不会从列表响应里获得 `userVote` 高亮状态；需要后续轻量 hydration 才能恢复。
- PV 数字变为短 TTL 近实时，且同访客同路径短时间重复访问会被降噪，不再是严格实时原始 PV。

## Validation

- `npx vitest run tests/integration/feed-api.test.ts tests/integration/analytics-api.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npx @shawnxie666/forge-loop validate --slug "优化p0和p1-匿名公开feed共享缓存-并降级pv-uv实时统计成本"`
- Completion claim is based on the fresh command results in Commands Run.
