---
forge_loop: true
artifact: quick-task
slug: source-monitor-pagination-prev
status: done
mode: fix
blocking: false
---

# Quick Task: source-monitor-pagination-prev

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 监控模块-信息源详情列表的上一页按钮在第2页点击时无法返回第一页 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复监控模块信息源详情列表在第 2 页点击“上一页”不重新请求第 1 页数据的问题。
- 为信息源详情列表分页的前进和后退交互补回归测试。

## Out of Scope

- 不调整监控信息源 API 契约、筛选语义、分页组件通用行为或后端分页实现。

## Acceptance

- 有 SSR 初始快照时，首次渲染不发重复请求。
- 点击“下一页”会请求第 2 页。
- 从第 2 页点击“上一页”会请求第 1 页，并展示第 1 页快照。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 信息源详情 | `SourceMonitorPanel` 中的监控信息源列表 |
| 分页 | `PaginationControls` 的上一页/下一页交互 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/components/source-monitor-panel.test.tsx` |
| Failure Signal | 新增回归断言期望第二次 fetch 请求 `/api/admin/monitor/sources?page=1&pageSize=10`，但修复前只调用了一次 fetch |
| Determinism | deterministic |
| Re-run Plan | 修改后重跑同一组件测试，再跑 `npm run lint` |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 渲染第 1 页初始快照，点击“下一页”进入第 2 页，再点击“上一页” |
| Observed Failure | 修复前组件没有发起第 1 页请求，仍停留在第 2 页快照 |
| Expected Behavior | 从第 2 页点击“上一页”应请求并展示第 1 页 |
| Root Cause | `SourceMonitorPanel` 为避免 SSR 初始快照重复请求，使用“参数等于初始 page/pageSize 且无筛选”作为跳过条件；该条件在用户从第 2 页返回初始第 1 页时也成立，导致 effect 直接返回 |
| Fix Hypothesis | 将跳过逻辑收窄为仅跳过首次 effect；后续即使参数回到初始值，也正常调用 `fetchSources()` |
| Regression Validation | `npm test -- tests/components/source-monitor-panel.test.tsx` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

N/A

## Files Likely Touched

- `src/components/admin/source-monitor-panel.tsx`
- `tests/components/source-monitor-panel.test.tsx`

## Execution

- 扩展组件测试，覆盖第 1 页到第 2 页再返回第 1 页的 fetch 序列。
- 将 `SourceMonitorPanel` 的初始跳过逻辑改为一次性 ref 标记。
- 运行组件测试和 lint。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/admin/source-monitor-panel.tsx` | 移除按初始分页参数长期跳过 fetch 的判断，改成仅跳过 SSR 初始快照对应的首个 effect |
| `tests/components/source-monitor-panel.test.tsx` | 分页测试扩展为前进和后退双向校验，断言返回第 1 页时请求正确 URL |
| `tasks/quick/source-monitor-pagination-prev.md` | 记录 Quick Lane 修复过程、根因和验证 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- tests/components/source-monitor-panel.test.tsx` | fail | 修复前新增回归测试失败：第二次 fetch 未发生 |
| `npm test -- tests/components/source-monitor-panel.test.tsx` | pass | 5 tests passed |
| `npm run lint` | pass with warnings | 0 errors；3 个已有 unused-var warning，位于 `src/components/admin/admin-page-client.tsx` 和 `tests/integration/item-cleanup.test.ts` |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 此问题只影响前端状态驱动的重新拉取，不需要调整后端分页 API。

## Risks

- 低风险；改动仅影响 `SourceMonitorPanel` 初始 SSR 去重与后续参数变化触发请求的边界。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
