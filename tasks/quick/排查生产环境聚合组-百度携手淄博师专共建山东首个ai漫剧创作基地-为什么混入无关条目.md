---
forge_loop: true
artifact: quick-task
slug: 排查生产环境聚合组-百度携手淄博师专共建山东首个ai漫剧创作基地-为什么混入无关条目
status: done
mode: quick
blocking: false
---

# Quick Task: 排查生产环境聚合组-百度携手淄博师专共建山东首个ai漫剧创作基地-为什么混入无关条目

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 排查生产环境聚合组：百度携手淄博师专共建山东首个AI漫剧创作基地，为什么把毫不相关的条目放到一起 |
| Owner | human |
| Created | 2026-05-04 |
| Risk | production |
| Escalation | none |
| Upgrade Summary | 只读生产排查，不修改数据 |

## Scope

- SSH 到生产环境只读查询 Docker 容器、SQLite 数据和后台任务记录。
- 定位目标聚合组当前条目、事件签名、更新时间和触发阶段。
- 本地复算这两个事件作为直接 pair 时是否会被规则放行。

## Out of Scope

- 不修改生产数据库。
- 不拆分或修复生产聚合组。
- 不改代码。

## Acceptance

- 给出该异常聚合的直接原因：规则过滤、AI merge 结果，还是人工操作。
- 给出证据时间线和后续修复建议。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 聚合组 | project context / admin UI |
| 聚合合并 | cluster merge stage |
| 归组决策 | cluster assignment stage |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | trace |
| Command | `ssh root@152.32.230.86 ... sqlite3 /app/data/dev.db` |
| Failure Signal | 目标 cluster 内出现无关 git-am 条目 |
| Determinism | deterministic |
| Re-run Plan | 复查目标 cluster、items 和 2026-05-04 05:00 ingestion task timeline |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 查询 `content_clusters.title LIKE '%百度携手淄博师专共建山东首个AI漫剧创作基地%'` |
| Observed Failure | cluster `cmojeu8ac3pd6pi01f00oesxm` 下有 `山东首家百度AI漫剧创作基地正式落户淄博` 与 `git-am 误把提交消息里的假 diff 当补丁` 两条 |
| Expected Behavior | git-am 条目不应与百度 AI 漫剧基地合并 |
| Root Cause | 2026-05-04 05:00 scheduled ingestion 的 `cluster_merge` 阶段移动条目；直接 pair 本地评分会 `object_conflict` 拒绝，说明不是这对被规则放行，而是 AI 在扁平候选池中自由分组误判 |
| Fix Hypothesis | merge AI 输入应保留 pair/edge 约束，执行合并前再用本地 pair guard 校验每个 AI 返回组 |
| Regression Validation | 本地 `buildClusterMergeCandidateSelection([baidu, git])` 返回 0 candidates，diagnostics `rejectedObjectConflict=2` |
| Failed Hypotheses | 0 |
| Handoff | 如需修复生产数据，可对该 cluster 执行拆分或移出 git-am 条目；如需代码修复，限制 AI merge 输出不得跨无本地 related edge 的 pair |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `executeClusterMerge` 先用本地 pair 打分选 cluster 集合，再 `buildClusterMergeInput` 只发送扁平 cluster JSON 给 AI，最后 `mergeClustersInternal` 直接执行 AI 返回组 |
| Architecture Candidates | 改成 edge-aware merge input：把允许合并的 pair 边一起传给 AI，并在执行前校验任意 source-target 至少存在允许边 |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- N/A

## Execution

- 查生产 Docker 容器：`infinitum` / `infinitum-worker-1` 使用 `/app/data/dev.db`。
- 查询目标 cluster 与 items。
- 查询 2026-05-04 05:00 后台 ingestion timeline。
- 本地用当前候选选择逻辑复算百度/gitam 直接 pair。

### Changed Files

| File | Change |
| --- | --- |
| `tasks/quick/排查生产环境聚合组-百度携手淄博师专共建山东首个ai漫剧创作基地-为什么混入无关条目.md` | 记录生产排查证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `ssh root@152.32.230.86 'docker ps ...'` | pass | 确认生产容器和 image `v0.1.1-rc4` |
| `sqlite3 /app/data/dev.db SELECT ... FROM content_clusters/items` | pass | 查到目标 cluster 和两条 item |
| `sqlite3 /app/data/dev.db SELECT ... FROM background_task_runs` | pass | 05:00 scheduled ingestion 的 merge 阶段移动 7 条 |
| `npx tsx -e 'buildClusterMergeCandidateSelection([baidu, git])'` | pass | 直接 pair 被 `object_conflict` 拒绝 |

## Result

done

## Follow-ups

- 修复方向：让 cluster merge 变成 edge-aware，AI 只能在本地 related pair 边内组合；执行 AI 返回组前做本地 pair guard。
- 数据处理方向：对生产该 cluster 拆分或将 git-am 条目移出。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否现在处理生产错误聚合数据 | human | no | 未执行，等待确认 |

## Assumptions

- 生产 SQLite `updatedAt` 能作为入组/移动时间线证据。

## Risks

- 未记录 AI merge 原始输出，因此无法精确还原 AI 返回的完整 merge group；当前结论基于 item 更新时间、任务 timeline 和本地 pair 复算。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
