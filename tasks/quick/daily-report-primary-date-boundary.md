---
forge_loop: true
artifact: quick-task
slug: daily-report-primary-date-boundary
status: done
mode: quick
blocking: false
---

# Quick Task: daily-report-primary-date-boundary

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 优化日报候选日期边界：以 eventDate 或 publishedAt 为主，createdAt 只作为兜底 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 调整日报候选日期边界判断。
- 有合法 `eventDate` 时优先按事件日期匹配日报日期。
- 没有合法事件日期时按 `publishedAt` 的 Asia/Shanghai 当天窗口匹配。
- `createdAt` 只保留为没有事件日期且没有发布时间时的兜底。

## Out of Scope

- 不改变日报日期窗口本身的 Asia/Shanghai 计算。
- 不修改 `eventDate` 入库格式或 prompt。
- 不修改数据库 schema。

## Acceptance

- `eventDate=日报日期` 的内容即使发布时间/入库时间不在当天也能进入候选。
- 有 `eventDate` 但不等于日报日期的内容，即使发布时间/入库时间在当天也不进入候选。
- 没有 `eventDate` 时按 `publishedAt` 判断，`createdAt` 不抢主判断。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/integration/daily-report-service.test.ts` |
| Failure Signal | 日期边界候选包含/排除错误 |
| Determinism | deterministic |
| Re-run Plan | 目标集成测试 + 类型检查 + lint |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | N/A |
| Expected Behavior | N/A |
| Root Cause | N/A |
| Fix Hypothesis | N/A |
| Regression Validation | 新增日期边界集成测试 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Date Priority | `cluster.eventDate` 优先于 `item.eventDate`，两者都没有合法日期时用 `publishedAt` |
| Fallback | `createdAt` 只在没有合法事件日期且没有 `publishedAt` 时使用；当前 schema 中 `publishedAt` 非空，所以主要是未来兼容兜底 |
| Query Shape | 数据库层用宽 OR 取候选池，JS 层用优先级函数做最终日期过滤，避免 OR 放宽语义 |

## Files Likely Touched

- `src/lib/daily-report/repository.ts`
- `tests/integration/daily-report-service.test.ts`

## Execution

- 新增日期优先级判断函数。
- 把候选查询从单一 `createdAt` 范围改为事件日期/发布时间/入库时间候选池。
- 在最终候选分组前按优先级过滤。
- 新增集成测试覆盖 eventDate、publishedAt 和 createdAt 优先级。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/daily-report/repository.ts` | 新增 `eventDate -> publishedAt -> createdAt` 日期边界过滤 |
| `tests/integration/daily-report-service.test.ts` | 新增日报候选日期边界测试 |
| `tasks/quick/daily-report-primary-date-boundary.md` | 记录本次实现与验证 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane quick |
| `npx @shawnxie666/forge-loop scaffold quick --slug daily-report-primary-date-boundary ...` | pass | 创建任务记录 |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/integration/daily-report-service.test.ts` | pass | 1 file, 15 tests passed |
| `npx eslint src/lib/daily-report/repository.ts tests/integration/daily-report-service.test.ts` | pass | 改动文件 lint 通过 |
| `npx @shawnxie666/forge-loop validate --slug daily-report-primary-date-boundary` | pass | workflow artifact 校验通过 |

## Result

done

## Follow-ups

- 可考虑将日期优先级函数抽到可单测的小模块，如果后续 feed/day-range 也需要复用。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否需要在后台展示候选命中的日期来源？ | human | no | 本轮不做 UI |

## Assumptions

- `eventDate` 只有 `YYYY-MM-DD` 视为合法日期；非法或空值退回 `publishedAt`。

## Risks

- 当前候选池仍先按质量分截取，极低质量但事件日期匹配的内容可能不会进入候选池；这与上一轮候选池上限策略一致。

## Validation

- 已运行 fresh validation：类型检查、目标集成测试、改动文件 lint。
- Completion claim is based on the fresh command results in Commands Run.
