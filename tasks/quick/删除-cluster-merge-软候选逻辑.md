---
forge_loop: true
artifact: quick-task
slug: 删除-cluster-merge-软候选逻辑
status: done
mode: quick
blocking: false
---

# Quick Task: 删除-cluster-merge-软候选逻辑

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 删除 cluster_merge 软候选逻辑，恢复对象冲突硬过滤，避免影响聚合效果 |
| Owner | human |
| Created | 2026-05-03 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 删除 `cluster_merge` 的预算化软候选通道。
- 删除软对象相关 result/timeline counters 和任务监控摘要展示。
- 保留 detach 后落 singleton cluster 的修复。
- 调整测试，确认强文本重叠但对象冲突的候选会被过滤。

## Out of Scope

- 不改 AI prompt。
- 不改聚合候选硬上限 80。
- 不回滚 detach singleton 修复。

## Acceptance

- `eventObject` 冲突重新作为硬过滤，不再因为主体一致和文本强重叠进入 AI 合并判定。
- timeline 不再输出 `软对象Pair`、`软对象入选`、`软对象Hash跳过`。
- 任务监控聚合合并摘要不再展示软对象指标。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/components/task-monitor-panel.test.tsx tests/integration/cluster-assignment.test.ts` |
| Failure Signal | 对象冲突候选仍进入候选列表，或软对象字段仍出现在 timeline/UI |
| Determinism | deterministic |
| Re-run Plan | 改动 cluster merge 规则或 timeline 显示后重跑同一组测试和 `npx tsc --noEmit` |

| Field | Value |
| --- | --- |
| Repro Steps | 构造 DeepSeek 识图模式 / 多模态识图功能候选，二者主体和文本重叠但对象不同 |
| Observed Failure | 软候选通道会把对象冲突候选送入 AI 判定，已影响聚合效果 |
| Expected Behavior | 对象冲突候选应被本地规则过滤 |
| Root Cause | 预算化软候选通道绕过了部分 `object_conflict` 硬过滤 |
| Fix Hypothesis | 删除软候选通道和相关指标，恢复原有对象冲突过滤 |
| Regression Validation | 聚焦单测、组件测试、集成测试、类型检查 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | `executeClusterMerge` -> `buildClusterMergeCandidateSelection` -> `scoreClusterMergePair`; ingestion timeline and task monitor consume merge diagnostics |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/config/constants.ts`
- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `src/lib/ingestion/service.ts`
- `src/lib/ingestion/task-timeline.ts`
- `src/components/admin/task-monitor-panel.tsx`
- `tests/unit/cluster-merge-candidates.test.ts`
- `tests/components/task-monitor-panel.test.tsx`

## Execution

- 删除软候选目标常量和 soft object diagnostics。
- 恢复对象冲突硬过滤，`hasEventAnchor` 不再包含软对象分支。
- 删除软对象 timeline metrics 和 UI 摘要片段。
- 将 DeepSeek 强文本重叠用例改为期望被过滤。

### Changed Files

| File | Change |
| --- | --- |
| `src/config/constants.ts` | 删除 `CLUSTER_MERGE_TARGET_CANDIDATE_COUNT` |
| `src/lib/clusters/helpers.ts` | 删除软对象冲突候选池和预算补齐逻辑 |
| `src/lib/clusters/service.ts` | 删除 soft object merge result 字段 |
| `src/lib/ingestion/service.ts` | 删除 soft object timeline counter 赋值 |
| `src/lib/ingestion/task-timeline.ts` | 删除 soft object timeline metrics |
| `src/components/admin/task-monitor-panel.tsx` | 删除软对象摘要展示 |
| `tests/unit/cluster-merge-candidates.test.ts` | 删除软候选召回/预算测试，新增对象冲突强重叠仍过滤断言 |
| `tests/components/task-monitor-panel.test.tsx` | 更新聚合合并摘要期望 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/components/task-monitor-panel.test.tsx tests/integration/cluster-assignment.test.ts` | pass | 3 files, 19 tests passed |
| `npx tsc --noEmit` | pass | 无类型错误 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否同时回滚 detach singleton 修复 | human | no | 本次保留，该修复不属于软候选逻辑 |

## Assumptions

- 当前聚合效果问题来自软候选通道，而不是 detach singleton 修复。

## Risks

- 删除软候选后，之前 DeepSeek / Stargate 这类对象抽取不一致的相近内容会再次被本地过滤，需要后续用更保守的方式单独设计。

## Validation

- `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/components/task-monitor-panel.test.tsx tests/integration/cluster-assignment.test.ts`
- `npx tsc --noEmit`
- Completion claim is based on the fresh command results in Commands Run.
