---
forge_loop: true
artifact: quick-task
slug: 实现-cluster-merge-窄多主体桥接候选规则
status: done
mode: quick
blocking: false
---

# Quick Task: 实现 cluster_merge 窄多主体桥接候选规则

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 确认，实现一个更针对的多主体、时间差异小场景解决方案，避免扩大融合范围 |
| Owner | Codex |
| Created | 2026-05-04 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 在 `cluster_merge` 本地候选评分中加入窄多主体桥接规则。
- 只影响原本因 `object_conflict` 被拒绝、但满足多主体近时强锚点的 pair。
- 增加单元测试锁定放行和拒绝边界。

## Out of Scope

- 不恢复预算化软候选通道。
- 不提高全局候选上限。
- 不新增 timeline/UI 指标。
- 不直接自动合并，仍交给 AI 判定。

## Acceptance

- 多主体、24 小时内、强文本锚点、distinctive overlap 足够的对象冲突 pair 可进入 AI 候选。
- 同主体对象冲突不放行。
- 显式事件日期不同不放行。
- 只有泛词重叠不放行。
- 现有候选上限、dirty/hash skip、AI 判定流程保持不变。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| cluster_merge | 聚合合并任务节点 |
| 多主体桥接 | 不同主体报道同一近时事件，依靠强锚点放行给 AI 判定 |
| object_conflict | 两边 eventObject 不强相似且无关系型重叠时的本地拒绝 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | unit + integration + typecheck + lint |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts`; `npm test -- tests/integration/cluster-assignment.test.ts`; `npx tsc --noEmit`; `npm run lint` |
| Failure Signal | 候选选择错误、集成合并路径回归、类型或 lint 错误 |
| Determinism | deterministic |
| Re-run Plan | 修改候选规则后重复上述命令 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | 软候选通道会扩大融合范围；删除后多主体近时对象冲突 pair 缺少针对性入口 |
| Expected Behavior | 仅极窄多主体桥接 pair 进入 AI 判定 |
| Root Cause | 原 hard `object_conflict` 没有区分主客体/多主体近时同事件场景 |
| Fix Hypothesis | 在 `object_conflict` 前加入 `isMultiSubjectBridgePair`，要求不同主体、24h 内、强文本锚点、distinctive overlap >= 3、动作不明显冲突 |
| Regression Validation | 单测覆盖 bridge 放行、日期冲突拒绝、泛词拒绝、同主体对象冲突拒绝；集成测试覆盖合并路径 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `executeClusterMerge` -> `buildClusterMergeCandidateSelection` -> `scoreClusterMergePair` |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/clusters/helpers.ts`
- `tests/unit/cluster-merge-candidates.test.ts`

## Execution

- 新增 bridge 判定常量与 helper。
- 将 distinctive overlap 从 boolean 改为计数。
- 仅在对象冲突前对窄 bridge pair 放行并加小额分数，使其进入 AI 判定。
- 增加单元测试。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/clusters/helpers.ts` | 新增窄多主体桥接候选规则 |
| `tests/unit/cluster-merge-candidates.test.ts` | 增加 bridge 放行与拒绝边界测试 |
| `tasks/quick/实现-cluster-merge-窄多主体桥接候选规则.md` | 记录任务、验证和风险 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "实现 cluster_merge 窄多主体桥接候选规则" --json` | pass | Quick Lane |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts` | pass | 10 tests passed |
| `npm test -- tests/integration/cluster-assignment.test.ts` | pass | 7 tests passed |
| `npx tsc --noEmit` | pass | no output |
| `npm run lint` | pass | 0 errors, existing `_props` warning |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否恢复软候选预算通道 | human | no | 不恢复；只做窄规则 |

## Assumptions

- 24 小时窗口足够覆盖当前“时间差异小”的桥接场景。
- `distinctive overlap >= 3` 能过滤泛词重叠，保留 Stargate/算力租赁这类强锚点。

## Risks

- 非显式负向动作目前只按“明显冲突”过滤，最终合并仍依赖 AI 判定。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
