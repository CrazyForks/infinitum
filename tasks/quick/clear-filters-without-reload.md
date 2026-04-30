---
forge_loop: true
artifact: quick-task
slug: clear-filters-without-reload
status: done
mode: quick
blocking: false
---

# Quick Task: clear-filters-without-reload

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 清除筛选不要刷新列表，只将筛选条件重置即可 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 调整主页 `清除筛选` 行为：只重置筛选控件状态，不刷新列表、不更新 URL。
- 保持 `查询` 按钮作为刷新列表的唯一筛选提交入口。

## Out of Scope

- 不改变 `查询` 按钮行为。
- 不改变分页和后台任务完成刷新使用已应用查询的逻辑。

## Acceptance

- 点击 `清除筛选` 后，创建时间、排序、分组、信息源、全文搜索等筛选控件恢复默认值。
- 点击 `清除筛选` 不调用 `/api/feed`。
- 点击 `清除筛选` 后当前列表内容保持不变。
- 再点击 `查询` 后才按默认筛选请求 `/api/feed?range=today&sort=time_desc`。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/components/feed-panel.test.tsx` |
| Failure Signal | `clearFilters` 内调用 `loadFeed(...)` 导致清除时立即刷新 |
| Determinism | deterministic |
| Re-run Plan | 点击 `清除筛选` 后断言 `fetch` 未调用，再点击 `查询` 断言默认 URL 请求 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 在带筛选条件的主页点击 `清除筛选` |
| Observed Failure | 旧逻辑会清空筛选后立即调用 `loadFeed` 请求默认列表 |
| Expected Behavior | 只重置筛选控件；列表刷新必须由 `查询` 触发 |
| Root Cause | `clearFilters` 同时承担“重置控件”和“提交默认查询”两个职责 |
| Fix Hypothesis | 移除 `clearFilters` 中的 `loadFeed` 调用，保留状态重置 |
| Regression Validation | `npx vitest run tests/components/feed-panel.test.tsx` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Files Likely Touched

- `src/components/feed/feed-panel.tsx`
- `tests/components/feed-panel.test.tsx`

## Execution

- 从 `clearFilters` 中移除默认查询请求。
- 更新组件测试，覆盖清除筛选不请求、列表保持、点击查询后请求默认视图。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/feed/feed-panel.tsx` | `clearFilters` 只重置筛选状态，不再调用 `loadFeed` |
| `tests/components/feed-panel.test.tsx` | 更新清除筛选测试，断言清除不请求、查询才请求 |
| `tasks/quick/clear-filters-without-reload.md` | 记录 Quick Lane 证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "清除筛选不要刷新列表，只将筛选条件重置即可" --json` | pass | Quick Lane, low risk, small scope, no contract impact |
| `npx @shawnxie666/forge-loop scaffold quick --slug clear-filters-without-reload --request "清除筛选不要刷新列表，只将筛选条件重置即可"` | pass | 生成 quick task |
| `npx vitest run tests/components/feed-panel.test.tsx` | pass | 1 file passed, 48 tests passed |
| `npm run lint` | pass | 0 errors；存在既有 warning：`src/components/admin/admin-page-client.tsx:133` `_props` 未使用 |
| `npx @shawnxie666/forge-loop validate --slug clear-filters-without-reload` | pass | workflow artifact ok |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- `清除筛选` 是重置草稿筛选条件，不再代表提交默认查询。

## Risks

- 清除筛选后筛选摘要变为默认，但列表仍是上一次已应用查询结果，直到用户点击 `查询`；这是本次目标行为。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
