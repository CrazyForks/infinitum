---
forge_loop: true
artifact: quick-task
slug: homepage-filter-query-button
status: done
mode: quick
blocking: false
---

# Quick Task: homepage-filter-query-button

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 在清除筛选右边增加查询按钮，筛选项变更后不自动触发列表请求，需要点击查询才刷新 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 主页筛选区增加 `查询` 按钮，位置在 `清除筛选` 右侧。
- 筛选控件变更只更新本地待查询状态，不立即请求列表。
- 点击 `查询` 后统一更新 URL、请求 `/api/feed` 并刷新列表。

## Out of Scope

- 不改后端 feed API。
- 不在本任务中定义 `清除筛选` 的最终行为；该行为由后续 `clear-filters-without-reload` 任务覆盖。

## Acceptance

- 修改创建时间、排序、分组、信息源、发表时间或全文搜索时，不自动触发列表请求。
- 点击 `查询` 后按当前筛选值发起列表请求。
- 分页、阅读进度恢复、展开聚合详情和后台任务完成刷新继续使用已应用查询，不受未提交筛选值影响。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/components/feed-panel.test.tsx` |
| Failure Signal | 原测试期望筛选控件变更后立即请求 `/api/feed` |
| Determinism | deterministic |
| Re-run Plan | 修改筛选项后断言 `fetch` 未调用，再点击 `查询` 验证请求 URL |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 在主页筛选区修改时间范围、排序、分组或全文搜索 |
| Observed Failure | 旧实现中 `updateRange`、`changeSort`、`changeGroup`、`changeSource`、日期变更和全文搜索防抖都会直接调用 `loadFeed` |
| Expected Behavior | 筛选变更只暂存；点击 `查询` 才刷新列表 |
| Root Cause | 筛选状态和已应用查询状态耦合，控件变更函数直接触发列表请求 |
| Fix Hypothesis | 引入已应用查询状态；控件变更只更新草稿状态；`查询` 统一调用 `loadFeed(buildQuery())` |
| Regression Validation | `npx vitest run tests/components/feed-panel.test.tsx` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Files Likely Touched

- `src/components/feed/feed-panel.tsx`
- `src/components/ui/filter-summary.tsx`
- `tests/components/feed-panel.test.tsx`

## Execution

- 扩展 `FilterSummary` 支持右侧附加 actions。
- 在 `FeedPanel` 中新增 `appliedQuery`，移除全文搜索防抖自动请求。
- 将筛选控件的变更函数改为只更新本地状态。
- 将分页、页大小、阅读进度、展开聚合详情和任务完成刷新切回已应用查询。
- 更新组件测试。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/feed/feed-panel.tsx` | 增加查询按钮，拆分待查询筛选状态和已应用查询状态，移除筛选项自动请求 |
| `src/components/ui/filter-summary.tsx` | 支持在清除筛选按钮右侧渲染额外 action |
| `tests/components/feed-panel.test.tsx` | 更新筛选交互测试，覆盖点击查询后才请求 |
| `tasks/quick/homepage-filter-query-button.md` | 记录 Quick Lane 证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "在清除筛选右边增加查询按钮，筛选项变更后不自动触发列表请求，需要点击查询才刷新" --json` | pass | Quick Lane, low risk, small scope, no contract impact |
| `npx @shawnxie666/forge-loop scaffold quick --slug homepage-filter-query-button --request "在清除筛选右边增加查询按钮，筛选项变更后不自动触发列表请求，需要点击查询才刷新"` | pass | 生成 quick task |
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

- `清除筛选` 是显式命令；其最终行为由后续 `clear-filters-without-reload` 任务调整为只重置控件、不刷新列表。

## Risks

- 用户修改筛选后，列表仍显示旧结果直到点击 `查询`；这是本次交互目标，但 UI 上筛选摘要会即时反映待查询值。`清除筛选` 的最终行为以后续 `clear-filters-without-reload` 任务为准。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
