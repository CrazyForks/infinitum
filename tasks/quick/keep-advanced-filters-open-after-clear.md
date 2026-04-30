---
forge_loop: true
artifact: quick-task
slug: keep-advanced-filters-open-after-clear
status: done
mode: quick
blocking: false
---

# Quick Task: keep-advanced-filters-open-after-clear

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 清除筛选后不主动收起高级筛选展开 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 调整主页 `清除筛选` 行为：保留高级筛选展开状态。

## Out of Scope

- 不定义 `清除筛选` 是否刷新列表；该行为由后续 `clear-filters-without-reload` 任务覆盖。
- 不改变 `查询` 按钮的显式查询行为。

## Acceptance

- 高级筛选处于展开状态时点击 `清除筛选`，展开区仍保持打开。
- 全文搜索输入清空，筛选摘要恢复默认。
- 列表刷新行为以后续 `clear-filters-without-reload` 任务为准。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/components/feed-panel.test.tsx` |
| Failure Signal | `clearFilters` 调用 `setAdvancedFiltersOpen(false)` |
| Determinism | deterministic |
| Re-run Plan | 点击 `清除筛选` 后断言 `高级筛选` 的 `aria-expanded` 仍为 `true` |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 以带高级筛选条件的主页状态渲染，点击 `清除筛选` |
| Observed Failure | 高级筛选被主动收起 |
| Expected Behavior | 高级筛选保持展开 |
| Root Cause | `clearFilters` 内显式执行 `setAdvancedFiltersOpen(false)` |
| Fix Hypothesis | 移除该状态更新，其他清空和请求逻辑保持不变 |
| Regression Validation | `npx vitest run tests/components/feed-panel.test.tsx` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Files Likely Touched

- `src/components/feed/feed-panel.tsx`
- `tests/components/feed-panel.test.tsx`

## Execution

- 移除 `clearFilters` 中关闭高级筛选的状态更新。
- 更新清除筛选测试，断言展开状态和输入清空。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/feed/feed-panel.tsx` | `clearFilters` 不再关闭高级筛选展开 |
| `tests/components/feed-panel.test.tsx` | 增加清除筛选后仍展开和全文搜索清空的断言 |
| `tasks/quick/keep-advanced-filters-open-after-clear.md` | 记录 Quick Lane 证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "清除筛选后不主动收起高级筛选展开" --json` | pass | Quick Lane, low risk, small scope, no contract impact |
| `npx @shawnxie666/forge-loop scaffold quick --slug keep-advanced-filters-open-after-clear --request "清除筛选后不主动收起高级筛选展开"` | pass | 生成 quick task |
| `npx vitest run tests/components/feed-panel.test.tsx` | pass | 1 file passed, 48 tests passed |
| `npm run lint` | pass | 0 errors；存在既有 warning：`src/components/admin/admin-page-client.tsx:133` `_props` 未使用 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 本任务只约束高级筛选展开状态；`清除筛选` 是否刷新列表以后续任务为准。

## Risks

- N/A

## Validation

- Completion claim is based on the fresh command results in Commands Run.
