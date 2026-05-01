---
forge_loop: true
artifact: quick-task
slug: daily-report-composite-candidates
status: done
mode: quick
blocking: false
---

# Quick Task: daily-report-composite-candidates

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 优化日报候选排序：改为日报专用综合分、不直接使用用户投票权重、候选 cluster-aware 去重 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 日报候选构建从裸 `qualityScore` 排序改为日报专用综合分。
- 综合分只使用 AI 质量分、当天候选池内的来源数和条目数聚合信号。
- 同一 active cluster 在日报候选中只占一个候选位，使用 cluster 标题/摘要/事件字段作为候选展示上下文。

## Out of Scope

- 不引入用户投票权重。
- 不改日报候选 DTO 或数据库 schema。
- 不改变日报日期窗口语义。

## Acceptance

- 多来源 cluster 可凭聚合信号排在单篇更高 `qualityScore` 的 item 前。
- 同一 cluster 的多条 item 不再重复占用日报候选位。
- 原有日报生成测试通过。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/integration/daily-report-service.test.ts` |
| Failure Signal | candidate order or source references regress |
| Determinism | deterministic |
| Re-run Plan | 运行目标测试、`npx tsc --noEmit` 和 lint |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | N/A |
| Expected Behavior | N/A |
| Root Cause | N/A |
| Fix Hypothesis | N/A |
| Regression Validation | 目标集成测试新增 cluster-aware 候选排序断言 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Candidate Ranking | `listDailyReportCandidates` 现在使用 `50 + (qualityScore - 50) * 0.85 + sourceBoost + itemBoost` 排序 |
| No Vote Weight | 日报综合分没有接入 cluster upvotes/downvotes，避免用户偏好影响编辑型日报 |
| Cluster Awareness | 候选池先按 active cluster 分组；同一 cluster 只保留最高质量代表 item |
| Candidate Pool | 为避免拉取当天全量长正文，先按质量分取 `limit * 4`，最多 2000 条作为候选池 |

## Files Likely Touched

- `src/lib/daily-report/repository.ts`
- `tests/integration/daily-report-service.test.ts`

## Execution

- 修改日报候选查询：排除 hidden cluster，构建候选池后按 cluster/item 分组。
- 增加日报专用综合分函数，按综合分、质量分、发布时间、入库时间排序。
- 新增集成测试覆盖综合分排序和 cluster 去重。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/daily-report/repository.ts` | 日报候选改为 cluster-aware 分组和日报专用综合分排序 |
| `tests/integration/daily-report-service.test.ts` | 新增候选排序/cluster 去重测试，并补充 cluster 清理 |
| `tasks/quick/daily-report-composite-candidates.md` | 记录本次实现和验证 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane quick |
| `npx @shawnxie666/forge-loop scaffold quick --slug daily-report-composite-candidates ...` | pass | 创建任务记录 |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/integration/daily-report-service.test.ts` | pass | 1 file, 14 tests passed |
| `npm run lint -- src/lib/daily-report/repository.ts tests/integration/daily-report-service.test.ts` | pass | 退出码 0；全仓库扫描有既有 warning：`src/components/admin/admin-page-client.tsx` 未使用 `_props` |
| `npx eslint src/lib/daily-report/repository.ts tests/integration/daily-report-service.test.ts` | pass | 本次改动文件无 lint 问题 |

## Result

done

## Follow-ups

- 可后续评估是否改用 `publishedAt` / `eventDate` 作为日报日期窗口。
- 可进一步让 cluster 候选携带多来源引用，而不是只保留代表 item 的 URL/source。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否要把 cluster 候选扩展为多 source 引用？ | human | no | 本轮保持 DTO 不变，只保留代表 item |

## Assumptions

- 日报候选优先覆盖重要事件，聚合信号比用户投票更适合作为编辑型日报排序加权。

## Risks

- 候选池上限可能漏掉质量分较低但来源很多的事件；当前用 `limit * 4` / 2000 上限控制性能和召回的平衡。
- cluster 候选当前仍只落一条代表来源，不能完整展示多来源证据。

## Validation

- 已运行本轮 fresh validation：类型检查、目标集成测试、lint。
- Completion claim is based on the fresh command results in Commands Run.
