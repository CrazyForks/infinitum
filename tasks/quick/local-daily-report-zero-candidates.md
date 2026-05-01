---
forge_loop: true
artifact: quick-task
slug: local-daily-report-zero-candidates
status: done
mode: quick
blocking: false
---

# Quick Task: local-daily-report-zero-candidates

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 排查本地日报生成任务 cmomd3s8x0014o00110dlkun0 候选为 0 的原因 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 查询 Docker 本地环境中的任务记录、任务时间线和日报候选过滤条件。
- 对比 `2026-05-01`、`2026-04-30`、`2026-04-29` 的候选日期命中情况。
- 判断候选为 0 是任务失败、数据缺失还是日期边界语义导致。

## Out of Scope

- 不修改生产环境。
- 不改数据库数据。
- 不调整日报日期边界实现。

## Acceptance

- 明确任务 `cmomd3s8x0014o00110dlkun0` 的状态、目标日期、候选数和跳过原因。
- 明确候选为 0 的具体过滤条件。

| Field | Value |
| --- | --- |
| Loop Type | trace |
| Command | `docker exec infinitum node -e ...` |
| Failure Signal | 任务时间线总候选数为 0 |
| Determinism | deterministic |
| Re-run Plan | 重新查询同一任务和同一日期候选计数 |

| Field | Value |
| --- | --- |
| Repro Steps | 查询任务 ID `cmomd3s8x0014o00110dlkun0`，再按日报候选日期优先级统计候选 |
| Observed Failure | 任务状态为 `succeeded`，但 `progressLabel` 为“候选内容不足 2 条，已跳过生成。”，时间线总候选数为 0 |
| Expected Behavior | 如果目标日期有不少于 2 条候选则调用模型生成日报 |
| Root Cause | 任务目标日期是 `2026-05-01`；按 Asia/Shanghai 日报窗口和新的 `eventDate -> publishedAt -> createdAt` 优先级，最新抓取内容都不属于 5 月 1 日 |
| Fix Hypothesis | 本轮只排查；若产品语义要“生成最新抓取内容日报”，应改默认日期为最新可候选日期或设置 offset |
| Regression Validation | Docker 容器内候选统计显示 `2026-05-01` 为 0，`2026-04-30` 为 10 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Task Status | `cmomd3s8x0014o00110dlkun0` 是 Docker 本地环境任务，不在 host `prisma/dev.db` |
| Candidate Date | `2026-05-01` 的 Asia/Shanghai 窗口是 `2026-04-30T16:00:00.000Z` 到 `2026-05-01T16:00:00.000Z` |
| Data Evidence | 最新 20 条内容 `createdAt` 在 5 月 1 日，但 `publishedAt` 都在 4 月 30 日白天，且没有 `eventDate=2026-05-01` |
| Candidate Counts | 按当前日期优先级：`2026-04-29` 有 12 条，`2026-04-30` 有 10 条，`2026-05-01` 有 0 条 |

## Files Likely Touched

- `tasks/quick/local-daily-report-zero-candidates.md`

## Execution

- 查询 host 与 Docker 两套本地数据库，定位真实任务数据落点。
- 查询任务状态和 timeline。
- 按日报日期优先级统计候选命中原因。
- 记录结论。

### Changed Files

| File | Change |
| --- | --- |
| `tasks/quick/local-daily-report-zero-candidates.md` | 记录本次本地任务候选为 0 的排查证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane quick |
| `npx @shawnxie666/forge-loop scaffold quick --slug local-daily-report-zero-candidates ...` | pass | 创建任务记录 |
| `sqlite3 prisma/dev.db ... background_task_runs ...` | pass | host `dev.db` 未找到该任务 |
| `docker exec infinitum node -e ... backgroundTaskRun.findUnique(...)` | pass | 找到任务，状态 succeeded/skipped，候选 0 |
| `docker exec infinitum node -e ... candidate counts ...` | pass | `2026-05-01` 0 条，`2026-04-30` 10 条 |

## Result

done

## Follow-ups

- 如果希望手动“今天生成”自动覆盖最近抓取内容，可考虑把默认日报日期改成“最新候选发布日期”，或在定时任务设置 `dailyReportOffsetDays=1`。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否要把手动生成默认日期从 today 改为 latest candidate date？ | human | no | 本轮只排查 |

## Assumptions

- 用户触发的是 Docker 本地环境 `localhost:3001`，不是 host `localhost:3000`。

## Risks

- 当前语义符合已要求的日期边界，但如果 UI 仍默认 today，早上生成时容易出现“抓了昨天内容，但今天日报候选为 0”的体验落差。

## Validation

- 已用 Docker 容器内 Prisma 查询验证任务记录和候选日期分布。
- Completion claim is based on the fresh command results in Commands Run.
