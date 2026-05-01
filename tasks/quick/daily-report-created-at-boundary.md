---
forge_loop: true
artifact: quick-task
slug: daily-report-created-at-boundary
status: done
mode: quick
blocking: false
---

# Quick Task: daily-report-created-at-boundary

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 撤掉日报候选 eventDate/publishedAt 日期边界逻辑，恢复按 createdAt 过滤 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 日报候选日期边界恢复为 `createdAt` 的 Asia/Shanghai 当天窗口。
- 保留日报候选综合分排序和 cluster-aware 去重。
- 更新集成测试，防止 `eventDate` / `publishedAt` 再作为候选日期边界。

## Out of Scope

- 不回滚日报候选综合分。
- 不回滚同 cluster 只占一个候选位的逻辑。
- 不改数据库 schema 或生产配置。

## Acceptance

- `createdAt` 在日报日期窗口内的内容进入候选。
- 只有 `eventDate` 或 `publishedAt` 命中、但 `createdAt` 不在窗口内的内容不进入候选。
- 本地 Docker `localhost:3001` 重建后使用新逻辑。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/integration/daily-report-service.test.ts` |
| Failure Signal | 日报候选日期边界不符合 `createdAt` 语义 |
| Determinism | deterministic |
| Re-run Plan | 类型检查、目标集成测试、改动文件 lint、Docker 重建后容器库候选计数 |

| Field | Value |
| --- | --- |
| Repro Steps | 本地 Docker 任务 `cmomd3s8x0014o00110dlkun0` 在 `2026-05-01` 因 `publishedAt` 日期不命中而候选为 0 |
| Observed Failure | 国外信息源或跨时区发布时间可能让 `publishedAt` 边界误排除刚抓取的本地候选 |
| Expected Behavior | 日报候选以系统入库/处理日期 `createdAt` 作为边界 |
| Root Cause | 上一轮把日期边界改为 `eventDate -> publishedAt -> createdAt`，对跨时区/外部发布时间不稳定 |
| Fix Hypothesis | 移除 `eventDate/publishedAt` 边界过滤，仅在 DB 查询层使用 `createdAt` 范围 |
| Regression Validation | 新增/调整测试验证只有 `createdAt` 命中才进入候选 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Candidate Boundary | `listDailyReportCandidates` 现在只用 `createdAt >= start && createdAt < end` 做日期边界 |
| Ranking | 日报综合分和 cluster 去重仍保留 |
| Local Runtime | Docker app/worker 已重建并启动，容器库中 `2026-05-01` 按 createdAt 有 20 条候选行 |

## Files Likely Touched

- `src/lib/daily-report/repository.ts`
- `tests/integration/daily-report-service.test.ts`
- `tasks/quick/daily-report-created-at-boundary.md`

## Execution

- 移除日报候选日期优先级辅助函数。
- 将候选查询恢复为 `createdAt` 范围过滤。
- 调整日期边界测试。
- 跑验证并重建 Docker。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/daily-report/repository.ts` | 候选日期边界恢复为 `createdAt` |
| `tests/integration/daily-report-service.test.ts` | 日期边界测试改为验证 `createdAt` 语义 |
| `tasks/quick/daily-report-created-at-boundary.md` | 记录本次回滚和验证 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane quick |
| `npx @shawnxie666/forge-loop scaffold quick --slug daily-report-created-at-boundary ...` | pass | 创建任务记录 |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/integration/daily-report-service.test.ts` | pass | 1 file, 15 tests passed |
| `npx eslint src/lib/daily-report/repository.ts tests/integration/daily-report-service.test.ts` | pass | 改动文件 lint 通过 |
| `docker compose up -d --build` | pass | app/worker 镜像重建并重启 |
| `docker exec infinitum node - ... createdAt candidate count ...` | pass | `2026-05-01` 候选行 20 条 |

## Result

done

## Follow-ups

- 可后续在 UI 上把“候选日期依据”明确展示为入库日期，避免和发布时间/事件日期混淆。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否还需要在 prompt 中继续抽取 eventDate？ | human | no | 本轮只影响日报候选边界，不影响内容展示字段 |

## Assumptions

- `createdAt` 更符合当前日报“本系统当天抓取/处理内容”的业务语义。

## Risks

- 同一来源跨时区内容会按本地处理日进入日报，而不是外部发布时间日；这是本轮按用户要求接受的语义。

## Validation

- 类型检查、目标集成测试、改动文件 lint、Docker build 和容器库候选计数均已通过。
- Completion claim is based on the fresh command results in Commands Run.
