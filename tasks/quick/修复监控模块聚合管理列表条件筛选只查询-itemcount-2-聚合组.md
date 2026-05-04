---
forge_loop: true
artifact: quick-task
slug: 修复监控模块聚合管理列表条件筛选只查询-itemcount-2-聚合组
status: done
mode: fix
blocking: false
---

# Quick Task: 修复监控模块聚合管理列表条件筛选只查询 itemCount>=2 聚合组

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 监控模块聚合管理列表中的条件筛选应该只针对 itemCount>=2 的聚合组，现在条目为 1 的也能筛选出来 |
| Owner | Codex |
| Created | 2026-05-04 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复聚合管理主列表关键词筛选请求。
- 增加组件回归测试，锁定 search 场景仍携带 `minItemCount=2`。

## Out of Scope

- 不修改 `/api/admin/clusters` 的通用能力；API 仍允许其他入口不传 `minItemCount` 查询 singleton。
- 不修改合并弹窗和前台手动加入聚合的选择入口。

## Acceptance

- 聚合管理主列表默认查询带 `minItemCount=2`。
- 聚合管理主列表关键词筛选也带 `minItemCount=2`。
- 单条目聚合不会因为主列表条件筛选被查出来。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 聚合管理主列表 | `ContentReviewPanel` 的 `activeTab="clusters"` 列表 |
| 条件筛选 | 聚合管理列表关键词筛选 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | component test + API regression + typecheck + lint |
| Command | `npm test -- tests/components/content-review-panel.test.tsx`; `npm test -- tests/integration/admin-cluster-api.test.ts`; `npx tsc --noEmit`; `npm run lint` |
| Failure Signal | 搜索 URL 缺少 `minItemCount=2`；API minItemCount 行为回归；类型或 lint 错误 |
| Determinism | deterministic |
| Re-run Plan | 修改请求参数后重复上述命令 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 聚合管理主列表输入关键词后发起 `/api/admin/clusters?...search=...` |
| Observed Failure | 有搜索词时 `ContentReviewPanel` 传 `minItemCount: null`，导致 API 可以返回 `itemCount=1` 的 singleton 聚合 |
| Expected Behavior | 聚合管理主列表无论是否搜索都只查询 `itemCount>=2` 聚合组 |
| Root Cause | 主列表 fetch 分支使用 `debouncedClusterSearch.trim() ? null : 2`，把 search 场景从多条目聚合限制中放开 |
| Fix Hypothesis | 主列表固定传 `minItemCount: 2`；保留其他调用方不传该参数的能力 |
| Regression Validation | 组件测试断言 search URL 为 `/api/admin/clusters?page=1&pageSize=10&search=OpenAI&minItemCount=2`；API 测试确认显式 `minItemCount=2` 仍会排除 singleton |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `ContentReviewPanel` -> `fetchReviewClusters` -> `/api/admin/clusters` -> `listAdminClusters` |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/components/admin/content-review-panel.tsx`
- `tests/components/content-review-panel.test.tsx`

## Execution

- 将聚合管理主列表 fetch 参数固定为 `minItemCount: 2`。
- 将聚合管理关键词 placeholder 改成当前实际搜索范围。
- 增加主列表搜索 URL 回归测试。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/admin/content-review-panel.tsx` | 聚合管理主列表搜索固定带 `minItemCount=2` |
| `tests/components/content-review-panel.test.tsx` | 增加 search URL 回归测试 |
| `tasks/quick/修复监控模块聚合管理列表条件筛选只查询-itemcount-2-聚合组.md` | 记录根因、修复和验证 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "修复监控模块聚合管理列表条件筛选只查询 itemCount>=2 聚合组" --json` | pass | Quick Lane fix |
| `npm test -- tests/components/content-review-panel.test.tsx` | pass | 14 tests passed |
| `npm test -- tests/integration/admin-cluster-api.test.ts` | pass | 8 tests passed |
| `npx tsc --noEmit` | pass | no output |
| `npm run lint` | pass | 0 errors, existing `_props` warning |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| API 是否也默认强制 `minItemCount=2` | Codex | no | 不改；该 API 还有合并弹窗/其他选择入口复用，主列表由调用方显式传参约束 |

## Assumptions

- 用户所说“监控模块聚合管理列表”对应后台 `ContentReviewPanel activeTab="clusters"` 的主列表。

## Risks

- 仅聚合管理主列表被收窄；其他入口仍可能按业务需要查询 singleton 聚合。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
