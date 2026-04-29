---
forge_loop: true
artifact: quick-task
slug: cluster-merge-p1-observability-dirty-sort
status: done
mode: quick
blocking: false
---

# Quick Task: cluster-merge-p1-observability-dirty-sort

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 处理聚合合并 P1：补充 merge pass 指标并让 dirty anchor 优先排序 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 为自动 cluster_merge 增加可观测指标。
- 调整候选排序，让 dirty cluster 优先进入 AI 输入。
- 保持实际合并 target 仍由 itemCount 决定，不改变目标选择语义。

## Out of Scope

- 不新增数据库表。
- 不引入 pair-level evaluation state。
- 不修改 AI prompt 或模型配置。

## Acceptance

- task timeline 能显示基础池、pair 过滤、hash 跳过、dirty 候选、AI 返回、移动条目和失败组等指标。
- 候选列表排序优先 dirty cluster，再按 best score、itemCount、latestPublishedAt。
- 原有聚合合并行为测试通过。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts` |
| Failure Signal | 候选排序或诊断统计行为回归 |
| Determinism | deterministic |
| Re-run Plan | 串行运行 unit/component/integration/tsc/lint |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | P1 优化项待实现：缺少 merge pass 诊断指标，dirty anchor 排序未显式优先 |
| Expected Behavior | 可在任务详情看到 merge pass 关键计数；新增/变化候选在 AI 输入中排在稳定邻居前 |
| Root Cause | 原 `buildClusterMergeCandidates()` 只返回候选数组，没有 diagnostics；最终排序先按 itemCount，dirty 状态不参与排序 |
| Fix Hypothesis | 增加 `buildClusterMergeCandidateSelection()` 返回 candidates + diagnostics；timeline counters 接收 diagnostics；候选排序加入 dirty 优先 |
| Regression Validation | unit + component + integration + typecheck + lint |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `executeClusterMerge()` -> `buildClusterMergeCandidateSelection()` -> timeline counters -> task monitor detail |
| Architecture Candidates | 后续 pair-level state 仍需新表或 JSON 字段，本轮不做 |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `src/lib/ingestion/service.ts`
- `src/lib/ingestion/task-timeline.ts`
- `src/components/admin/task-monitor-panel.tsx`
- `tests/unit/cluster-merge-candidates.test.ts`
- `tests/components/task-monitor-panel.test.tsx`

## Execution

- 新增 `ClusterMergeCandidateDiagnostics`，统计 total pairs、硬拒绝原因、低分、相关 pair、AI 候选 pair、hash 跳过、dirty pair、裁剪前后候选数和 dirty 候选数。
- 新增 `buildClusterMergeCandidateSelection()`，保留 `buildClusterMergeCandidates()` 兼容旧调用。
- 候选排序改为 dirty 优先，然后 best score、itemCount、latestPublishedAt。
- `executeClusterMerge()` 返回更完整的 merge pass 指标，包括 AI 返回组、移动条目、失败组。
- ingestion timeline counters 和任务详情文案展示新增指标。
- 组件测试补充 cluster_merge 指标展示，并修正一个分页详情测试的 fetch stub，避免挂在初始加载态。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/clusters/helpers.ts` | 增加候选 diagnostics，dirty-first 排序，兼容旧候选构造函数 |
| `src/lib/clusters/service.ts` | 扩展 merge pass 返回指标，记录 AI 返回组、移动条目、失败组 |
| `src/lib/ingestion/service.ts` | 将 merge pass 指标写入 timeline counters |
| `src/lib/ingestion/task-timeline.ts` | 扩展 clusterMerge counter 类型和 timeline metrics |
| `src/components/admin/task-monitor-panel.tsx` | 更新 cluster_merge 详情摘要 |
| `tests/unit/cluster-merge-candidates.test.ts` | 覆盖 dirty 候选优先排序 |
| `tests/components/task-monitor-panel.test.tsx` | 覆盖新增指标展示，并稳定分页详情测试 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "处理聚合合并 P1：补充 merge pass 指标并让 dirty anchor 优先排序" --json` | pass | Quick Lane, low risk |
| `npx @shawnxie666/forge-loop scaffold quick --slug cluster-merge-p1-observability-dirty-sort --request "处理聚合合并 P1：补充 merge pass 指标并让 dirty anchor 优先排序"` | pass | 生成 quick task |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts` | pass | 6 tests passed |
| `npm test -- tests/components/task-monitor-panel.test.tsx` | pass | 4 tests passed |
| `npm test -- tests/integration/cluster-assignment.test.ts` | pass | 5 tests passed |
| `npx tsc --noEmit` | pass | 无输出 |
| `npm run lint` | pass | 0 errors; existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props` |
| `npx @shawnxie666/forge-loop validate --slug cluster-merge-p1-observability-dirty-sort` | pass | quick task artifact valid |
| `git diff --check` | pass | 无 whitespace error |

## Result

done

## Follow-ups

- 观察真实任务中的 `基础池 / 本地Pair / Hash跳过 / Dirty候选 / AI返回组 / 移动条目` 后，再决定是否继续做 P2。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否需要把新增指标拆成更详细的 UI 区块 | human | no | 当前先放入 timeline metrics 和摘要，观察是否够用 |

## Assumptions

- 当前任务详情摘要可以承载更高密度的 cluster_merge 诊断信息。
- Dirty 优先只影响 AI 输入顺序，不改变最终 target 选择。

## Risks

- 指标较多，任务详情摘要会变长；但比无法调参更可控。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
