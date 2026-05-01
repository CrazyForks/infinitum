---
forge_loop: true
artifact: quick-task
slug: cluster-merge-soft-candidate-budget
status: done
mode: quick
blocking: false
---

# Quick Task: cluster-merge-soft-candidate-budget

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | optimization |
| Request | 实现预算化软候选通道优化聚合合并候选召回，并修复从聚合移除条目后 clusterId 为空导致无法再聚合 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | medium |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 调整 `cluster_merge` 本地候选筛选，在严格候选不足 50 个时引入预算化软对象冲突候选。
- 补充软候选诊断计数，方便生产 timeline 观察软通道命中与 hash 跳过情况。
- 修复从聚合组移除条目后 `clusterId` 为空，导致后续聚合合并无法再纳入该条目的问题。
- 简化任务监控里 `聚合合并` 节点摘要，只展示核心指标。

## Out of Scope

- 不修改 AI 聚合判定 prompt。
- 不放宽事件日期冲突过滤。
- 不改变 80 个候选组硬上限。
- 不在生产环境执行写操作。

## Acceptance

- DeepSeek 识图、多模态识图这类主体一致且文本强重叠但对象抽取不同的候选，可以进入 AI 聚合判定。
- Acme 产品 A/B 这类仅共享主体、动作、日期的对象冲突样例仍被过滤。
- 被移出聚合的条目会落入新的单条目聚合组，后续仍有机会进入聚合合并。
- 任务详情里的聚合合并摘要保留候选、Dirty、Hash、软对象、AI 返回、移动/失败和结果状态，避免展示过多诊断项。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` |
| Failure Signal | 软对象冲突候选未入选，或对象冲突误放宽，或 detach 后 item.clusterId 为空 |
| Determinism | deterministic |
| Re-run Plan | 修改候选筛选或 detach 流程后重跑同一组测试，并补跑 `npx tsc --noEmit` |

| Field | Value |
| --- | --- |
| Repro Steps | 构造 DeepSeek 识图模式/多模态识图功能、OpenAI Stargate/星际之门计划，以及产品 A/B 对象冲突候选 |
| Observed Failure | 生产排查中相近条目主要被分数和 `object_conflict` 拦在 AI 聚合判定前；被移出聚合的条目可能变成 `clusterId=null` |
| Expected Behavior | 强文本重叠的对象冲突样例在候选不足时进入 AI 判定，普通对象冲突仍过滤；detach 后条目仍属于单条目聚合 |
| Root Cause | `object_conflict` 是硬过滤，且 detach 只清空 clusterId 后重算原聚合，没有为被移出条目建立新的可聚合载体 |
| Fix Hypothesis | 增加 50 目标的软候选预算通道，并在 detach 后用禁用普通聚合的 assignment 创建 singleton cluster |
| Regression Validation | 聚焦单测、集成测试、类型检查、lint |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | `executeClusterMerge` -> `buildClusterMergeCandidateSelection` -> `aiProvider.mergeClusters`; `detachItemFromCluster` -> `assignItemToCluster` -> `recomputeCluster` |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/config/constants.ts`
- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `src/lib/ingestion/service.ts`
- `src/lib/ingestion/task-timeline.ts`
- `tests/unit/cluster-merge-candidates.test.ts`
- `tests/integration/cluster-assignment.test.ts`
- `src/components/admin/task-monitor-panel.tsx`
- `tests/components/task-monitor-panel.test.tsx`

## Execution

- 增加软召回目标常量，保留 80 硬上限。
- 在候选筛选中把强文本重叠的对象冲突 pair 单独收集，严格候选不足 50 时按 dirty、分数、发布时间补入。
- 软通道要求至少两个非通用文本交叉 token，避免“产品 A/B”误入。
- detach 后立即创建 singleton cluster，并重算原聚合与新聚合。
- 补充聚焦测试和 timeline 诊断字段。
- 将 `聚合合并` 前端摘要压缩成核心指标行，软对象展示为 `入选/总 pair`。

### Changed Files

| File | Change |
| --- | --- |
| `src/config/constants.ts` | 新增 `CLUSTER_MERGE_TARGET_CANDIDATE_COUNT = 50` |
| `src/lib/clusters/helpers.ts` | 新增预算化软对象冲突候选选择与诊断，保留日期冲突硬过滤和 80 硬上限 |
| `src/lib/clusters/service.ts` | 输出软候选诊断；detach 后创建 singleton cluster |
| `src/lib/ingestion/service.ts` | 将软候选诊断写入 timeline counters |
| `src/lib/ingestion/task-timeline.ts` | 增加 `软对象Pair`、`软对象入选`、`软对象Hash跳过` 指标 |
| `src/components/admin/task-monitor-panel.tsx` | 简化 `聚合合并` timeline 摘要，只展示核心指标 |
| `tests/components/task-monitor-panel.test.tsx` | 覆盖简化后的软对象摘要展示 |
| `tests/unit/cluster-merge-candidates.test.ts` | 覆盖 DeepSeek 软召回、50 目标预算、产品 A/B 仍过滤 |
| `tests/integration/cluster-assignment.test.ts` | 覆盖 detach 后生成 singleton cluster，并保留对象冲突不误触发 AI |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` | pass | 2 files, 15 tests passed |
| `npm test -- tests/components/task-monitor-panel.test.tsx` | pass | 1 file, 5 tests passed |
| `npx tsc --noEmit` | pass | 无类型错误 |
| `npm run lint` | pass with warning | 仅既有 `src/components/admin/admin-page-client.tsx:133` `_props` unused warning |
| `npx @shawnxie666/forge-loop validate --slug cluster-merge-soft-candidate-budget` | pass | workflow artifact valid |
| `docker compose up -d --build` | pass | 本地 `localhost:3001` app/worker 已重建启动 |

## Result

done

## Follow-ups

- 上线后观察 timeline 的 `软对象Pair`、`软对象入选`、`候选组`，确认候选规模是否稳定接近 50 且未触发明显误召回。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否需要进一步放宽日期冲突 | human | no | 本次不放宽，日期冲突继续硬过滤 |

## Assumptions

- 生产环境 AI 判定成本可接受约 50 个候选组，且 80 个硬上限继续作为异常保护。

## Risks

- 软通道会提高 AI 判定输入量，可能带来少量误召回；当前通过 subject 相似、强文本重叠、至少两个非通用交叉 token、dirty 优先和 50 目标预算控制风险。

## Validation

- `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts`
- `npm test -- tests/components/task-monitor-panel.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- Completion claim is based on the fresh command results in Commands Run.
