---
forge_loop: true
artifact: quick-task
slug: admin-daily-draft-loading-state
status: done
mode: quick
blocking: false
---

# Quick Task: admin-daily-draft-loading-state

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 优化管理员查看草稿日报详情时先闪现日报不存在再加载详情的体验 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 管理员访问草稿日报详情时，在客户端管理员会话确认前显示加载态。
- 保持匿名用户确认后仍显示“日报不存在”。
- 保持原有 `useClientAdminSession` API，避免影响 header/list/feed 现有调用。

## Out of Scope

- 不改变服务端公开视角只返回已发布日报的语义。
- 不改变 admin detail API 权限。
- 不调整日报详情页面路由和 SEO metadata。

## Acceptance

- 管理员打开草稿日报详情时不再先闪现“日报不存在”。
- 管理员会话确认后加载草稿详情。
- 匿名访问未发布草稿时仍显示未发布或不存在提示。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/components/daily-report-detail.test.tsx` |
| Failure Signal | 草稿详情 hydration 期间出现“日报不存在” |
| Determinism | deterministic |
| Re-run Plan | 组件测试 + 类型检查 + lint |

| Field | Value |
| --- | --- |
| Repro Steps | 以已登录管理员访问未发布草稿的 `/daily/<date>` 详情 |
| Observed Failure | 服务端公开查询返回 null，客户端 admin 查询完成前先渲染“日报不存在” |
| Expected Behavior | admin session/client detail 查询未完成前显示加载态 |
| Root Cause | `useClientAdminSession` 只暴露布尔值，详情页无法区分“正在确认管理员会话”和“确认不是管理员” |
| Fix Hypothesis | 增加带 `isResolving` 的 session hook，详情页在 resolving/admin detail loading 时显示 loading empty state |
| Regression Validation | 组件测试断言初始显示“正在加载日报”，且不出现“日报不存在” |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Data Flow | `/daily/[date]` 服务端按 public 查详情；草稿返回 null；客户端确认 admin 后再查 `/api/admin/daily-reports/[date]` |
| UX Fix | unresolved admin session now maps to loading state instead of unavailable state |
| Compatibility | Existing `useClientAdminSession()` still returns boolean; new `useClientAdminSessionState()` is used only where loading state matters |

## Files Likely Touched

- `src/components/ui/use-client-admin-session.ts`
- `src/components/daily/daily-report-detail.tsx`
- `tests/components/daily-report-detail.test.tsx`

## Execution

- 给 admin session hook 增加 resolving 状态。
- 日报详情空态根据 resolving/admin detail loading 显示“正在加载日报”。
- 更新组件测试覆盖管理员草稿 hydration 场景。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/ui/use-client-admin-session.ts` | 新增 `useClientAdminSessionState`，保留旧 boolean hook |
| `src/components/daily/daily-report-detail.tsx` | 草稿详情 hydration 期间显示 loading state |
| `tests/components/daily-report-detail.test.tsx` | 更新断言，防止“日报不存在”闪现回归 |
| `tasks/quick/admin-daily-draft-loading-state.md` | 记录本次实现和验证 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane quick |
| `npx @shawnxie666/forge-loop scaffold quick --slug admin-daily-draft-loading-state ...` | pass | 创建任务记录 |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/components/daily-report-detail.test.tsx` | pass | 1 file, 2 tests passed |
| `npx eslint src/components/ui/use-client-admin-session.ts src/components/daily/daily-report-detail.tsx tests/components/daily-report-detail.test.tsx` | pass | 改动文件 lint 通过 |

## Result

done

## Follow-ups

- 如果列表页管理员数据 hydration 也出现类似闪烁，可复用 `useClientAdminSessionState` 做列表级 loading。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否需要服务端直接识别 admin cookie 渲染草稿详情？ | human | no | 本轮采用客户端无闪烁 loading，避免改 SEO/public cache 语义 |

## Assumptions

- 草稿详情仍不应暴露给匿名 SSR/public metadata。

## Risks

- 管理员会话接口失败时会从 loading 转为匿名空态；这是当前权限失败的合理降级。

## Validation

- 已运行类型检查、目标组件测试和改动文件 lint。
- Completion claim is based on the fresh command results in Commands Run.
