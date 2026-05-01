---
forge_loop: true
artifact: quick-task
slug: deepseek-cluster-prod-spike
status: done
mode: spike
blocking: false
---

# Quick Task: deepseek-cluster-prod-spike

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | spike |
| Spike Type | analysis |
| Request | 排查生产环境两个 DeepSeek 条目为什么没有被聚合合并，判断是规则过滤还是 AI 结果排定；只读分析生产数据 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | production |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 只读查询生产 SQLite 数据、最近 ingestion task timeline，以及本地聚合/合并候选规则。
- 判断两个 DeepSeek 条目未合并是本地规则过滤、入库归组 AI 判定，还是聚合合并 AI 判定。

## Out of Scope

- 不修改生产数据库。
- 不重启生产服务。
- 不调整聚合规则或触发手动合并。

## Acceptance

- 给出两条内容当前 item/cluster 状态、关键事件签名差异、合并候选规则复算结果和结论。

| Field | Value |
| --- | --- |
| Loop Type | production read-only trace |
| Command | `ssh root@152.32.230.86` + `docker exec infinitum sqlite3 -header -column /app/data/dev.db` |
| Failure Signal | 目标单条目没有进入目标聚合组 |
| Determinism | deterministic for current production data snapshot |
| Re-run Plan | 重跑相同 SQL 查询，并用本地 `scoreClusterMergePair` 规则复算 |

| Field | Value |
| --- | --- |
| Repro Steps | Query production items matching DeepSeek/识图/多模态视觉理解/图文交互, then query their clusters and recent ingestion task timeline. |
| Observed Failure | `DeepSeek 开启识图模式灰度测试，多模态视觉理解能力正式落地` is in cluster `cmokwfwo73aerpe014ud7gkg4`; related group `DeepSeek灰度测试识图模式拓展图文交互` is cluster `cmojw1c780fg9pm013p6eynmd`. |
| Expected Behavior | If considered the same event, the single item should join or later merge into `cmojw1c780fg9pm013p6eynmd`. |
| Root Cause | Merge pass local candidate scoring rejects the pair as `object_conflict`: target group eventObject is `识图模式`, single cluster eventObject normalizes to `多模态识图`; token overlap is only `识图`, not a strong object match. Therefore the pair is not sent to cluster_merge AI. |
| Fix Hypothesis | N/A, analysis only. A possible follow-up is to loosen object conflict when subject is identical and title/summary text overlap is strong. |
| Regression Validation | N/A, no code change. |
| Failed Hypotheses | 0 |
| Handoff | Initial assignment likely reached AI because local assignment score was 37, above `CLUSTER_AI_MIN_SCORE=35`; AI did not choose the existing group, so a new cluster was created. Later cluster_merge was blocked before AI by object conflict. |

| Area | Finding |
| --- | --- |
| Module Map | `processFeedItem` -> `assignItemToCluster` for first-pass grouping; `executeClusterMerge` -> `buildClusterMergeCandidateSelection` -> `scoreClusterMergePair` for post-pass cluster merging. |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/clusters/service.ts`
- `src/lib/clusters/helpers.ts`
- `src/config/constants.ts`
- `tasks/quick/deepseek-cluster-prod-spike.md`

## Execution

- Read cluster assignment and merge code paths.
- Query production item/cluster/task records read-only.
- Recalculate candidate scoring for the two clusters.
- Record conclusion.

### Changed Files

| File | Change |
| --- | --- |
| `tasks/quick/deepseek-cluster-prod-spike.md` | Recorded production read-only investigation evidence. |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Routed as Quick Lane spike, modelTier balanced. |
| `ssh root@152.32.230.86 'docker ps ...'` | pass | Confirmed production containers `infinitum` and `infinitum-worker-1`, image `v0.1.1-rc1`. |
| `docker exec infinitum sqlite3 -header -column /app/data/dev.db` | pass | Found target item and related cluster records. |
| `node <<'NODE' ... score reproduction ... NODE` | pass | Reproduced assignment score 37 and merge rejection `object_conflict`. |

## Result

done

## Follow-ups

- Consider a focused rule change: allow cluster_merge AI review when subjects match and full text overlap is strong, even if normalized eventObject differs by a product-mode vs capability wording such as `识图模式` vs `多模态识图`.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否要修改合并候选规则以覆盖这类命名差异？ | human | no | Analysis only in this task. |

## Assumptions

- Production access is limited to read-only inspection for this task.

## Risks

- Production data snapshot can change after the investigation; conclusion is based on records queried on 2026-05-01.

## Validation

- Validated through production SQL snapshots, recent ingestion task timeline, and local reproduction of the same scoring thresholds.
- Completion claim is based on the fresh command results in Commands Run.
