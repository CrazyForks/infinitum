---
forge_loop: true
artifact: quick-task
slug: optimize-cluster-merge-candidates
status: done
mode: quick
blocking: false
---

# Quick Task: optimize-cluster-merge-candidates

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | optimization |
| Request | 目前聚合合并召回的候选太多了，如何优化一下 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 优化 ingestion 中 cluster_merge 阶段发给 AI 的聚合合并候选召回数量。
- 保留已有本地相似度打分、对象冲突拒绝和多主体同事件召回逻辑。

## Out of Scope

- 不改 AI prompt。
- 不改数据库 schema。
- 不改人工合并 API 或聚合摘要生成链路。

## Acceptance

- 无本地合并锚点的多条目聚合组不再因为 itemCount >= 2 被无条件发送给 AI。
- 单次聚合合并候选池有硬上限，避免 7 天窗口内一次发出几百组。
- 已评估且输入未变化的旧候选对不会在后续任务中反复占用候选池。
- 原有同事件多主体召回和对象冲突拒绝测试仍通过。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts` |
| Failure Signal | 候选召回策略单测失败 |
| Determinism | deterministic |
| Re-run Plan | 修改后重跑 unit、cluster-assignment integration、tsc、lint |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 查看 cluster_merge 任务截图和 `buildClusterMergeCandidates()` |
| Observed Failure | 聚合合并候选 287 组，合并后 284 组，召回明显过宽 |
| Expected Behavior | 只把存在本地相似锚点的候选送 AI，并限制单次候选上限；后续任务优先围绕新增或变化聚合组召回 |
| Root Cause | `buildClusterMergeCandidates()` 先把所有 `itemCount >= 2` 的活跃聚合组加入 selectedIds；同时旧逻辑把 `mergeInputHash` 当整批候选集 hash，少量新增内容会扰动整批 hash，导致旧高分候选反复进入 prompt |
| Fix Hypothesis | 移除多条目聚合无条件入选，按 pair score 选择候选，加 per-anchor 与全局候选上限；把 `mergeInputHash` 改为单聚合组输入 hash，只让新增或变化的聚合组作为 dirty anchor 拉入稳定邻居 |
| Regression Validation | unit + integration + typecheck + lint |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `executeClusterMerge()` 读取 7 天 active clusters -> `buildClusterMergeCandidates()` 本地筛选 -> `buildClusterMergeInput()` 发给 `aiProvider.mergeClusters()` |
| Architecture Candidates | 后续更大优化可改成 connected components 分批 AI 判断，并记录 pair-level 或 component-level evaluation state |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/config/constants.ts`
- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `tests/unit/cluster-merge-candidates.test.ts`

## Execution

- 增加 `CLUSTER_MERGE_RELATED_PAIR_LIMIT` 和 `CLUSTER_MERGE_CANDIDATE_LIMIT`。
- `buildClusterMergeCandidates()` 不再默认选择所有多条目聚合组。
- 候选对按本地分数排序，单 anchor 只保留 top 3。
- 排序后的最终 AI 候选池裁剪到 80 组。
- `mergeInputHash` 改为保存单聚合组的合并输入 hash，而不是整批候选集 hash。
- 候选召回时跳过两侧都已评估且输入未变化的旧候选对；新增或变化的一侧仍可带入已评估邻居。
- 更新单测覆盖无锚点多条目聚合不入选、大候选池上限、旧候选对跳过、变化候选带入邻居。

### Changed Files

| File | Change |
| --- | --- |
| `src/config/constants.ts` | 新增聚合合并候选 per-anchor 与全局上限常量 |
| `src/lib/clusters/helpers.ts` | 收紧聚合合并候选召回逻辑，移除多条目无条件入选，增加裁剪与单聚合组输入 hash |
| `src/lib/clusters/service.ts` | 将 merge pass 的 `mergeInputHash` 写入改为逐候选输入 hash，避免整批 hash 扰动导致重复召回 |
| `tests/unit/cluster-merge-candidates.test.ts` | 更新候选召回语义测试，新增候选池上限与重复候选跳过测试 |
| `tasks/quick/optimize-cluster-merge-candidates.md` | 记录 Forge Quick Lane 执行和验证结果 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "目前聚合合并召回的候选太多了，如何优化一下" --json` | pass | Quick Lane, low risk, recommendedModel auto |
| `npx @shawnxie666/forge-loop scaffold quick --slug optimize-cluster-merge-candidates --request "目前聚合合并召回的候选太多了，如何优化一下"` | pass | 生成 quick task |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts` | pass | 6 tests passed |
| `npm test -- tests/integration/cluster-assignment.test.ts` | pass | 5 tests passed |
| `npx tsc --noEmit` | pass | 无输出 |
| `npm run lint` | pass | 0 errors, existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props` |

## Result

done

## Follow-ups

- 如果后续仍然有大量高分候选，可以把 merge pass 改成相似图 connected components 分批调用 AI，并记录 pair-level 或 component-level 评估状态。
- 可以在任务面板增加“召回候选 / 发送 AI 候选 / 裁剪数”三个指标，便于调参。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 候选上限 80 是否需要配置化 | human | no | 先作为常量保守落地，观察实际召回质量后再调整 |

## Assumptions

- 当前主要问题是 AI 输入候选过宽，而不是模型合并判断过宽。
- 比起召回所有成熟聚合组，更应优先召回存在本地事件锚点的候选。
- 对重复旧候选的抑制以“聚合组自身合并输入是否变化”为准；新候选仍允许带入少量已评估邻居。

## Risks

- 极少数本地规则打分过低、但 AI 原本可能合并的多条目聚合组会被延后到后续更明确的相似锚点出现时处理。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
