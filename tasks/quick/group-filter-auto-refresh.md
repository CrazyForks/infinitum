---
forge_loop: true
artifact: quick-task
slug: group-filter-auto-refresh
status: done
mode: fix
blocking: false
---

# Quick Task: group-filter-auto-refresh

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 现在分组筛选侧边栏点击不会自动刷新，需要点击分组筛选就触发刷新，修复查询按钮逻辑造成的回归 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- Restore immediate feed reload when a group is selected from the group filter sidebar.
- Keep advanced filters such as source/title/date gated by the 查询 button.

## Out of Scope

- No API contract, data model, ingestion, or admin refresh behavior changes.

## Acceptance

- Clicking a group in 分组筛选侧栏 immediately requests `/api/feed` with the selected `groupId`.
- Sidebar counts update from the latest feed response after that request.
- Source and other advanced filters still wait for 查询 before requesting.

## Feedback Loop

> Required for `Mode: fix`; recommended for risky quick changes.

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/components/feed-panel.test.tsx -t "selected group immediately|refreshes the sidebar counts"` |
| Failure Signal | New immediate-refresh assertions failed with `Number of calls: 0` after clicking group `AI (1)`. |
| Determinism | deterministic |
| Re-run Plan | Re-run targeted tests, then full `tests/components/feed-panel.test.tsx`, then static checks. |

## Debugging Evidence

> Required for `Mode: fix`; use `N/A` for quick or spike.

| Field | Value |
| --- | --- |
| Repro Steps | Update sidebar tests to expect an immediate `/api/feed?...groupId=...` request after clicking a group button, then run the targeted Vitest command. |
| Observed Failure | `fetchMock` was not called after sidebar group click; existing test coverage had encoded the query-button-only behavior. |
| Expected Behavior | Sidebar group click applies the group filter immediately and reloads page 1. |
| Root Cause | `changeGroup` only updated `groupId`/`sourceId` state after the query-button change; only `applyFilters` called `loadFeed`, so sidebar clicks no longer refreshed. |
| Fix Hypothesis | Have `changeGroup` call `loadFeed(buildQuery({ groupId, sourceId }), 1, pageSize, { scrollToTop: true })` after calculating the normalized group and any source reset. |
| Regression Validation | `npx vitest run tests/components/feed-panel.test.tsx` passed all 48 tests; `npx tsc --noEmit` passed; `npm run lint` passed with one pre-existing warning. |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/components/feed/feed-panel.tsx`
- `tests/components/feed-panel.test.tsx`

## Execution

- Reproduce with tests that assert sidebar click triggers a request.
- Update `changeGroup` to apply the group query immediately.
- Keep source and other advanced filters behind 查询.
- Run targeted and full component tests plus static checks.

### Changed Files

| File | Change |
| --- | --- |
| `src/components/feed/feed-panel.tsx` | `changeGroup` now reloads feed page 1 with the normalized group and source reset. |
| `tests/components/feed-panel.test.tsx` | Sidebar group tests now assert immediate fetch and preserve query-button gating for source filters. |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx vitest run tests/components/feed-panel.test.tsx -t "selected group immediately\|refreshes the sidebar counts"` | fail | Reproduced current regression after changing assertions: `fetchMock` calls stayed at 0 after group click. |
| `npx vitest run tests/components/feed-panel.test.tsx -t "selected group immediately\|refreshes the sidebar counts\|applies advanced filters only after clicking query\|omits the implicit today range"` | pass | 4 targeted tests passed after implementation. |
| `npx vitest run tests/components/feed-panel.test.tsx` | pass | 48 tests passed. |
| `npx tsc --noEmit` | pass | No TypeScript errors. |
| `npm run lint` | pass | No errors; one existing warning in `src/components/admin/admin-page-client.tsx` for unused `_props`. |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- Sidebar and mobile inline group filter entries share the same group-selection intent and should both apply immediately.

## Risks

- Low: group selection now triggers a request immediately, so flows that first choose a sidebar group and then a source will perform one group-only request before the final query.

## Validation

- Targeted regression tests, full `feed-panel` component test file, TypeScript, and lint were run in this turn.
- Completion claim is based on the fresh command results in Commands Run.
