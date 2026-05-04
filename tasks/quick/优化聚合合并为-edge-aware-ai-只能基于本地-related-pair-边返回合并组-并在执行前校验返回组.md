---
forge_loop: true
artifact: quick-task
slug: 优化聚合合并为-edge-aware-ai-只能基于本地-related-pair-边返回合并组-并在执行前校验返回组
status: done
mode: quick
blocking: false
---

# Quick Task: 优化聚合合并为-edge-aware-ai-只能基于本地-related-pair-边返回合并组-并在执行前校验返回组

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 按建议方向优化：聚合合并改为 edge-aware，AI 只能基于本地 related pair 边返回合并组，并在执行前校验返回组 |
| Owner | human |
| Created | 2026-05-04 |
| Risk | medium |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 聚合合并候选选择继续由本地 `scoreClusterMergePair` 规则产生。
- AI 聚合合并输入增加 `allowedPairs`，把本地允许的 related-pair 边显式传给 AI。
- 执行 AI 返回的合并组前，再按目标聚合组和来源聚合组之间是否存在 allowed edge 做本地过滤。

## Out of Scope

- 不放宽本地相似度、主体冲突、时间冲突规则。
- 不修改人工聚合管理接口和生产数据。
- 不恢复软候选逻辑。

## Acceptance

- AI 不能仅凭扁平候选列表把无本地 related-pair 边的聚合组放入可执行合并来源。
- 本地 allowed edge 存在时，AI 仍可在该边范围内请求合并。
- 旧版数组形式的 AI merge 输入仍能被 provider 解析，避免测试或兼容路径破坏。

| Field | Value |
| --- | --- |
| Loop Type | CLI |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` |
| Failure Signal | 本地 allowedPairs 缺失或执行前过滤未剔除无边来源 |
| Determinism | deterministic |
| Re-run Plan | 重新运行目标测试、类型检查、lint 和 admin cluster API 回归 |

| Field | Value |
| --- | --- |
| Repro Steps | 生产只读排查聚合组 `百度携手淄博师专共建山东首个AI漫剧创作基地`，本地重算“百度漫剧基地”与 `git-am` 条目的直接 pair |
| Observed Failure | 本地 pair 规则因主体/对象冲突拒绝该 pair，但 AI 收到扁平候选列表后仍把无关聚合组放入同一返回组 |
| Expected Behavior | AI 返回的合并来源必须和最终目标聚合组之间存在本地 allowed related-pair 边 |
| Root Cause | 本地候选选择只控制“哪些节点进入 AI”，没有把“哪些节点之间允许合并”的边约束传给 AI，也没有在执行前校验 AI 返回组的边合法性 |
| Fix Hypothesis | 在候选选择阶段保留 allowed pair 边，AI 输入携带边，执行前按目标边过滤来源，可阻断无本地相关边的误合并 |
| Regression Validation | `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `src/lib/ai/provider.ts`
- `src/config/prompts.ts`
- `tests/unit/cluster-merge-candidates.test.ts`
- `tests/integration/cluster-assignment.test.ts`

## Execution

- 在候选选择中收集 dirty AI-eligible related pair 边。
- 将 merge AI 输入从扁平数组升级为 `{ clusters, allowedPairs }`。
- provider 解析兼容旧数组和新对象输入。
- 执行 AI 返回组前按目标聚合组与来源聚合组的 allowed edge 过滤。
- 增加单测覆盖生产类似场景：百度/淄博边存在，`git-am` 无边；增加集成测试断言 AI 输入包含 allowedPairs。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/clusters/helpers.ts` | 增加 allowed edge 类型、生成、输入序列化和执行前过滤 helper |
| `src/lib/clusters/service.ts` | 聚合合并调用传入 allowedPairs，并在 `mergeClustersInternal` 前过滤无边来源 |
| `src/lib/ai/provider.ts` | 兼容解析新旧 merge 输入结构中的 cluster id |
| `src/config/prompts.ts` | 明确 AI 只能基于 `allowedPairs` 组合合并组 |
| `tests/unit/cluster-merge-candidates.test.ts` | 覆盖 allowedPairs 生成和无边来源过滤 |
| `tests/integration/cluster-assignment.test.ts` | 更新 AI merge mock，断言输入包含 OpenAI/Microsoft allowed edge |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` | pass | 2 files, 20 tests passed |
| `npm run lint` | pass | 0 errors；保留既有 `_props` unused warning |
| `git diff --check` | pass | 无 whitespace error |
| `npm test -- tests/integration/admin-cluster-api.test.ts` | pass | 1 file, 10 tests passed |

## Result

done

## Follow-ups

- 可在生产发布后观察 `cluster_merge` 的 `aiMergeGroups`、`mergedCount` 和误合并反馈；若仍出现链式误合并，再考虑要求 AI 返回 pair-level decisions 而不是 group-level decisions。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 当前聚合合并的目标选择仍沿用既有逻辑：同一 AI 返回组按 `itemCount` 降序选目标。
- 对无 target edge 的来源直接跳过，保守性优先于一次性合并完整连通分量。

## Risks

- 如果 AI 返回链式组 A-B-C，但最终目标只和其中部分来源有边，本次会只执行有 target edge 的来源；剩余相关项需后续批次再判断。

## Validation

- 已通过 Commands Run 中列出的新运行命令验证。
- Completion claim is based on the fresh command results in Commands Run.
