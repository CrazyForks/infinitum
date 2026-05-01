---
forge_loop: true
artifact: quick-task
slug: homepage-batch-merge-selection
status: done
mode: quick
blocking: false
---

# Quick Task: homepage-batch-merge-selection

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 在首页多选操作增加批量合并功能，支持将多选的条目合并到一个聚合组，以聚合条目多的为基准合并其他条目 |
| Owner | codex |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 首页管理员多选工具栏新增“批量合并”。
- 新增后端接口按所选 item ids 合并：选择所选条目中当前 `itemCount` 最大的 active 聚合组作为目标。
- 只移动本次选中的非目标条目，不移动同一来源聚合中未选中的兄弟条目。

## Out of Scope

- 不调整自动 AI 聚合合并流程。
- 不修改数据库 schema。

## Acceptance

- 多选至少 2 条内容后可以打开批量合并确认弹窗。
- 确认后调用后端批量合并接口，并刷新首页列表。
- 后端按最大 `itemCount` 聚合作为目标，移动其他所选条目并重算受影响聚合。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 聚合组 | 项目现有内容聚合实体 |
| 首页多选 | `FeedPanel` 管理员批量操作工具栏 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/integration/cluster-assignment.test.ts tests/components/feed-panel.test.tsx` |
| Failure Signal | 无批量合并入口或后端无法按所选条目合并 |
| Determinism | deterministic |
| Re-run Plan | 运行类型检查、服务集成测试、组件测试和局部 lint |

## Debugging Evidence

N/A

## Spike Findings

N/A

## Files Likely Touched

- `src/lib/clusters/service.ts`
- `src/app/api/admin/clusters/merge-items/route.ts`
- `src/components/feed/feed-panel*`
- `tests/**`

## Execution

- 新增 `mergeSelectedItemsToLargestCluster` 服务函数。
- 新增 `/api/admin/clusters/merge-items` 管理端接口。
- 首页批量操作工具栏新增“批量合并”按钮和确认弹窗。
- 补服务集成测试和前端组件测试。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/clusters/service.ts` | 新增按所选条目批量合并服务 |
| `src/app/api/admin/clusters/merge-items/route.ts` | 新增批量合并接口 |
| `src/components/feed/feed-panel.types.ts` | 批量操作类型加入 `merge` |
| `src/components/feed/feed-panel.api.ts` | 新增 `mergeSelectedItems` API helper |
| `src/components/feed/feed-panel.tsx` | 新增批量合并按钮、确认弹窗和成功/失败反馈 |
| `tests/integration/cluster-assignment.test.ts` | 覆盖只移动所选条目并保留未选中兄弟条目 |
| `tests/components/feed-panel.test.tsx` | 覆盖首页批量合并请求 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | TypeScript 检查通过 |
| `npx vitest run tests/integration/cluster-assignment.test.ts tests/components/feed-panel.test.tsx` | pass | 2 files, 55 tests passed |
| `npx vitest run tests/integration/admin-cluster-api.test.ts tests/components/content-review-panel.test.tsx tests/unit/search.test.ts` | pass | 3 files, 24 tests passed |
| `npx eslint src/lib/clusters/service.ts src/app/api/admin/clusters/merge-items/route.ts src/components/feed/feed-panel.types.ts src/components/feed/feed-panel.api.ts src/components/feed/feed-panel.tsx tests/integration/cluster-assignment.test.ts tests/components/feed-panel.test.tsx` | pass | 局部 lint 通过 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- “多选条目合并”按所选 item ids 操作，不隐式搬动未选中的同组条目。

## Risks

- 批量移动会触发受影响聚合重算；一次选择过多来源聚合时会有同步耗时。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
