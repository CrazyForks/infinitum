---
forge_loop: true
artifact: quick-task
slug: openai-stargate-compute-prod-spike
status: done
mode: spike
blocking: false
---

# Quick Task: openai-stargate-compute-prod-spike

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | spike |
| Spike Type | analysis |
| Request | 排查生产环境 OpenAI 星际之门和算力基础设施两个条目为什么没有被聚合合并；只读分析生产数据 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | production |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 只读查询生产 SQLite 数据、相关 background task timeline、page view 时间窗口和生产编译后的聚合服务逻辑。
- 判断两个 OpenAI/Stargate 条目未合并是因为无 cluster、规则过滤，还是 AI 判定。

## Out of Scope

- 不修改生产数据库。
- 不重启生产服务。
- 不触发重算、归组或手动合并。

## Acceptance

- 给出两个条目的当前 item/cluster 状态、事件签名差异、规则复算结果和剩余不确定性。

| Field | Value |
| --- | --- |
| Loop Type | production read-only trace |
| Command | `ssh root@152.32.230.86` + `docker exec infinitum sqlite3 -header -column /app/data/dev.db` |
| Failure Signal | `OpenAI调整“星际之门”计划...` currently has `clusterId` null, while `Building the compute infrastructure...` is in a 2-item cluster. |
| Determinism | deterministic for current production snapshot |
| Re-run Plan | Re-run exact item/cluster SQL and scoring reproduction. |

| Field | Value |
| --- | --- |
| Repro Steps | Query items matching `星际之门`, `算力基础设施`, `算力租赁`; inspect their clusters and task windows around item created/updated timestamps. |
| Observed Failure | `cmoks3nq82ok1pe01t1xahwgx` (`OpenAI调整“星际之门”计划...`) is processed/allowed but `clusterId` is null. `cmokq0bri2dmwpe01gj7begve` (`Building the compute infrastructure...`) belongs to cluster `cmoldlv8r0kwaln012ilw865z`, which also contains `Stargate Powers Some Gaslights`. |
| Expected Behavior | If considered the same event, the first item should either join the existing Stargate cluster or later be merged into it. |
| Root Cause | Current direct blocker is that the first item is not in any cluster, so cluster_merge has no cluster pair to evaluate. Separately, rule replay shows current signatures would not reach AI: assignment score against the existing cluster is 25 (< `CLUSTER_AI_MIN_SCORE=35`), and a hypothetical merge pair is rejected as `object_conflict` because `星际之门计划` and `Stargate算力基础设施计划` are not a strong object match. |
| Fix Hypothesis | N/A, analysis only. Possible follow-up is to add synonym/alias handling for `星际之门` and `Stargate`, or loosen object conflict when subject is same and text overlap is strong. |
| Regression Validation | N/A, no code change. |
| Failed Hypotheses | 0 |
| Handoff | The first item was created during the 2026-04-30 01:00 ingestion run. Its current `updatedAt` is 2026-04-30T07:42:32.600Z, but no item-specific background task exists then; production has direct admin endpoints such as detach that can clear `clusterId` without a task record. There is no audit table to prove the actor/action. |

| Area | Finding |
| --- | --- |
| Module Map | `assignItemToCluster` first-pass grouping; `detachItemFromCluster` can clear item cluster directly; `executeClusterMerge`/`buildClusterMergeCandidateSelection` only evaluates existing active clusters. |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/clusters/service.ts`
- `src/lib/clusters/helpers.ts`
- `tasks/quick/openai-stargate-compute-prod-spike.md`

## Execution

- Route as Quick Lane spike.
- Query production item and cluster state.
- Query task windows around item creation/update.
- Recalculate assignment and merge candidate scores from current signatures.

### Changed Files

| File | Change |
| --- | --- |
| `tasks/quick/openai-stargate-compute-prod-spike.md` | Recorded production read-only investigation evidence. |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Routed as Quick Lane spike, modelTier balanced. |
| `docker exec infinitum sqlite3 -header -column /app/data/dev.db` | pass | Found target item/cluster records and orphan state. |
| `node <<'NODE' ... score reproduction ... NODE` | pass | Reproduced assignment score 25 and hypothetical merge `object_conflict`. |
| production task/page view window queries | pass | Found no item-specific background task around the orphaning timestamp; no audit table exists. |

## Result

done

## Follow-ups

- Add observability/audit for manual detach/filter/join actions if production provenance matters.
- Consider alias-aware matching for `星际之门`/`Stargate` and product-plan vs infrastructure-plan object wording.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否要把第一条重新归组或手动并入 Stargate cluster？ | human | no | Analysis only in this task. |

## Assumptions

- Production access remains read-only for this investigation.

## Risks

- Production snapshot can drift; conclusion is based on queries run on 2026-05-01.
- Without audit logs, the reason `clusterId` became null cannot be proven beyond current state and code path compatibility.

## Validation

- Validated through production SQL snapshots, production task windows, compiled production code inspection, and local scoring reproduction.
- Completion claim is based on the fresh command results in Commands Run.
