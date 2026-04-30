---
forge_loop: true
artifact: quick-task
slug: task-kind-filter-completeness
status: done
mode: quick
blocking: false
---

# Quick Task: task-kind-filter-completeness

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 任务列表里任务类型不全，缺少清理任务，再检查下还有没有缺少其他的 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | UI-only filter option fix; no API, schema, or workflow impact |

## Scope

- Compare task list type filter options with the backend `BackgroundTaskRunKind` union.
- Add missing task kind options, including `item_cleanup`.
- Keep filter behavior precise for each concrete task kind.

## Out of Scope

- No backend task model, API response shape, or scheduler behavior changes.
- No changes to task labels outside the task list filter.

## Acceptance

- The task type filter exposes every concrete `BackgroundTaskRunKind`.
- Selecting `item_cleanup` shows cleanup tasks without grouping them under generic item processing.

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/components/task-monitor-panel.test.tsx` |
| Failure Signal | task type filter does not list all task kinds or cannot isolate cleanup tasks |
| Determinism | deterministic |
| Re-run Plan | rerun the component test after filter option changes |

| Field | Value |
| --- | --- |
| Repro Steps | inspect `TaskKindFilter`, `kindOptions`, and `BackgroundTaskRunKind` |
| Observed Failure | UI filter only had grouped values: ingestion, item, cluster, daily; cleanup was not a visible task type |
| Expected Behavior | filter lists ingestion, item_reanalyze, item_regenerate_summary, item_regenerate_translation, cluster_regenerate_summary, daily_report_generate, and item_cleanup |
| Root Cause | task list filter used coarse categories instead of the concrete task kind union |
| Fix Hypothesis | derive filter options from the exhaustive `kindLabels` record and compare `task.kind` directly |
| Regression Validation | component test asserts every option and cleanup-only filtering |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | `src/components/admin/task-monitor-panel.tsx` owns the task list filter; `src/lib/tasks/types.ts` and Prisma define all task kinds |
| Architecture Candidates | Use `kindLabels` as the single source for task type filter options |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/components/admin/task-monitor-panel.tsx`
- `tests/components/task-monitor-panel.test.tsx`

## Execution

- Compare task kind filter options with backend task kinds.
- Replace coarse task kind filter categories with concrete task kind options.
- Add component coverage for full option list and cleanup filtering.

### Changed Files

| File | Change |
| --- | --- |
| `src/components/admin/task-monitor-panel.tsx` | Uses concrete task kinds for the type filter and derives options from `kindLabels` |
| `tests/components/task-monitor-panel.test.tsx` | Adds coverage for every task kind option and `item_cleanup` filtering |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "任务列表里任务类型不全，缺少清理任务，再检查下还有没有缺少其他的" --json` | pass | Routed as Quick Lane spike, low risk |
| `npx @shawnxie666/forge-loop scaffold quick --slug task-kind-filter-completeness --request "任务列表里任务类型不全，缺少清理任务，再检查下还有没有缺少其他的"` | pass | Created quick task artifact |
| `rg -n "BackgroundTaskKind|item_cleanup|任务类型|task type|kind|daily_report_generate|cluster_regenerate_summary|item_regenerate|ingestion" src tests prisma/schema.prisma --glob '!**/.next/**'` | pass | Confirmed backend task kinds and relevant UI files |
| `npm test -- tests/components/task-monitor-panel.test.tsx` | pass | 5 tests passed |
| `npx tsc --noEmit` | pass | TypeScript validation passed |
| `npm run lint` | pass | 0 errors; 1 unrelated warning in `src/components/admin/admin-page-client.tsx` |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- "任务列表" refers to `TaskMonitorPanel` task type filtering; the separate admin monitor label map already included `item_cleanup`.

## Risks

- Changing grouped filters to concrete task kinds removes broad "content processing" and "aggregation processing" group filters; this matches the user's request for a complete task type list.

## Validation

- Component test, TypeScript check, and lint.
- Completion claim is based on the fresh command results in Commands Run.
