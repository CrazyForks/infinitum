---
forge_loop: true
artifact: quick-task
slug: evaluate-cluster-merge-optimizations
status: done
mode: spike
blocking: false
---

# Quick Task: evaluate-cluster-merge-optimizations

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | spike |
| Spike Type | analysis |
| Request | 评估聚合合并流程还有没有值得优化的地方 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 分析当前自动 cluster_merge 流程的后续优化空间。
- 只给实现级候选，不修改业务代码。

## Out of Scope

- 不改 prompt、schema、服务逻辑或测试。
- 不处理人工后台手动合并路径。

## Acceptance

- 给出按收益和风险排序的优化建议。
- 标明哪些建议现在值得做，哪些需要先观察。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | trace |
| Command | `nl -ba src/lib/clusters/service.ts` / `nl -ba src/lib/clusters/helpers.ts` |
| Failure Signal | N/A |
| Determinism | deterministic |
| Re-run Plan | 若实施 follow-up，再补对应 unit/integration tests |

## Debugging Evidence

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

## Spike Findings

| Area | Finding |
| --- | --- |
| Best Next | 增加 merge pass 可观测指标：基础池数量、本地候选 pair 数、dirty pair 数、裁剪前后数量、AI 返回组数、实际移动条目数 |
| Candidate Ranking | 可以先把 dirty anchor 优先级显式化，避免全局按 itemCount 排序让成熟旧组压过新增内容 |
| Evaluation State | 当前 per-cluster hash 已能避免大部分重复；更精细的是 pair-level evaluation state，但需要新表或 JSON 字段 |
| AI Batching | 候选池继续增长后，按 connected components 分批调用 AI 比全局 80 个候选更稳 |
| Merge Safety | 可在执行 AI merge 前本地复核 group 内每条 pair 是否至少存在一个强连接，避免模型跨弱连接串联误合并 |
| Tuning | `CLUSTER_MERGE_RELATED_PAIR_LIMIT=3` 和 `CLUSTER_MERGE_CANDIDATE_LIMIT=80` 应先通过指标观察再配置化 |
| Not Worth Now | 不建议立即引入 embedding 或向量库；当前事件签名和文本锚点还没观测到瓶颈证据 |

## Files Likely Touched

- `src/lib/clusters/service.ts`
- `src/lib/clusters/helpers.ts`
- `src/lib/ingestion/task-timeline.ts`
- `tests/unit/cluster-merge-candidates.test.ts`

## Execution

- 阅读 `executeClusterMerge()`、`buildClusterMergeCandidates()`、常量阈值和 AI merge 解析路径。
- 评估成本、准确性、重复召回和可观测性风险。

### Changed Files

| File | Change |
| --- | --- |
| `tasks/quick/evaluate-cluster-merge-optimizations.md` | 记录本次 spike 结论 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "评估聚合合并流程还有没有值得优化的地方" --json` | pass | Quick Lane spike, low risk |
| `npx @shawnxie666/forge-loop scaffold quick --slug evaluate-cluster-merge-optimizations --request "评估聚合合并流程还有没有值得优化的地方"` | pass | 生成 quick task |
| `nl -ba src/lib/ingestion/service.ts` | pass | 确认 cluster_merge 在 item processing 后、cluster_finalize 前 |
| `nl -ba src/lib/clusters/service.ts` | pass | 确认 merge pass、hash、AI、执行合并路径 |
| `nl -ba src/lib/clusters/helpers.ts` | pass | 确认本地 pair scoring、阈值和候选裁剪 |

## Result

done

## Follow-ups

- P1: 增加 merge pass 指标。
- P2: dirty anchor 优先排序。
- P2: AI merge group 本地复核。
- P3: connected components 分批。
- P3: pair-level evaluation state。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 当前实际裁剪前后数量和 dirty pair 比例是多少 | human | no | 需要上线观察或本地跑一次真实 ingestion 后统计 |

## Assumptions

- 当前优先目标是降低成本并保持合并质量，而不是追求最高召回。
- 当前还没有足够数据证明需要 embedding 或额外持久化 pair 表。

## Risks

- 继续收紧召回前如果没有指标，容易误判是召回不足还是模型判断不足。

## Validation

- Completion claim is based on source inspection and fresh route/scaffold commands in Commands Run.
