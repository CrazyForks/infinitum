---
forge_loop: true
artifact: quick-task
slug: ai-调用量趋势样式调整-坐标轴指标说明总调用放第一个-另外调整下让指标说明在同一行
status: done
mode: quick
blocking: false
---

# Quick Task: ai-调用量趋势样式调整-坐标轴指标说明总调用放第一个-另外调整下让指标说明在同一行

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | AI 调用量趋势样式调整，坐标轴指标说明总调用放第一个，另外调整下让指标说明在同一行 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 调整管理后台“AI 调用量趋势”折线图的指标说明顺序和单行布局。

## Out of Scope

- 不调整 AI 使用量统计口径、接口、数据库或其它图表。

## Acceptance

- 指标说明以“总调用”作为第一个指标。
- 指标说明在同一行展示；窄屏下允许横向滚动，避免自动换到第二行。

| Field | Value |
| --- | --- |
| Loop Type | CLI / browser |
| Command | `npx eslint src/components/admin/ingestion-dashboard.tsx` |
| Failure Signal | ESLint errors in the changed chart component |
| Determinism | deterministic |
| Re-run Plan | Re-run ESLint and, when local login is available, inspect `/admin` in browser |

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

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/components/admin/ingestion-dashboard.tsx`

## Execution

- 固定 AI 调用量系列配置顺序，以“总调用”开头。
- 用自定义 Legend 按固定顺序渲染单行指标说明。
- 运行组件级 lint 和可用的全量检查。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/admin/ingestion-dashboard.tsx` | 新增 `AI_USAGE_SERIES` 统一驱动折线与图例；新增 `AiUsageLegend` 单行图例。 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "AI 调用量趋势样式调整，坐标轴指标说明总调用放第一个，另外调整下让指标说明在同一行" --json` | pass | Routed to Quick Lane, low risk, small scope, no contract impact. |
| `npx eslint src/components/admin/ingestion-dashboard.tsx` | pass | Changed component has no lint errors. |
| `npm run lint` | pass with warnings | No errors; existing warnings remain in `src/components/admin/admin-page-client.tsx` and `tests/integration/item-cleanup.test.ts`. |
| `npx tsc --noEmit` | fail | Blocked by existing unrelated `tests/integration/item-cleanup.test.ts(57,9)` type error: `string` is not assignable to `ItemStatus | undefined`. |
| `npm run dev -- --port 3002` + browser `/admin` | blocked | Dev server started, but `/admin` redirected to `/login?redirect=/admin`; no credentials were used or guessed. |

## Result

done

## Follow-ups

- 如需截图级确认，需要提供或确认本地测试登录方式。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- “坐标轴指标说明”指 `AI 调用量趋势` 图表下方的 Recharts Legend。

## Risks

- 未做登录后的视觉截图验证；风险仅限图例间距可能需按真实数据页面微调。

## Validation

- `npx eslint src/components/admin/ingestion-dashboard.tsx` 通过。
- `npm run lint` 无错误，仅有既有 warning。
- `npx tsc --noEmit` 运行过，但被既有无关测试类型错误阻断。
- Completion claim is based on the fresh command results in Commands Run.
