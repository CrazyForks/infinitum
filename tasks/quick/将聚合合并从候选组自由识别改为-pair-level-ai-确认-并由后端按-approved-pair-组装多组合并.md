---
forge_loop: true
artifact: quick-task
slug: 将聚合合并从候选组自由识别改为-pair-level-ai-确认-并由后端按-approved-pair-组装多组合并
status: done
mode: quick
blocking: false
---

# Quick Task: 将聚合合并从候选组自由识别改为-pair-level-ai-确认-并由后端按-approved-pair-组装多组合并

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 将聚合合并从候选组自由识别改为 pair-level AI 确认，并由后端按 approved pair 组装多组合并 |
| Owner | human |
| Created | 2026-05-04 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 聚合合并 AI 输入从候选组列表改为本地筛出的 `pairs`。
- AI 输出从 `mergeGroups` 改为 `approvedPairs`，只确认两两 Pair。
- 后端根据 approved pair 组装多组合并，但只允许 target 直连 approved edge 的来源进入同一执行组。
- 继续保留执行前本地 allowed edge 校验。

## Out of Scope

- 不放宽本地 pair 规则。
- 不恢复软候选通道。
- 不修改生产数据或管理端人工合并接口。

## Acceptance

- AI 不再从最多 80 个候选聚合组里自由识别关系，只确认输入 pair。
- 多组合并通过 approved pair 图组装；链式 A-B、B-C 不会在目标 A 缺少 A-C 直连 approved edge 时把 C 一起合并进 A。
- AI 返回未出现在本地 pair 输入里的 pair 会被忽略。
- AI 明确返回 `approvedPairs: []` 时，以空批准结果为准，不回退执行旧格式 `mergeGroups`。

| Field | Value |
| --- | --- |
| Loop Type | CLI |
| Command | `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/unit/ai-provider.test.ts tests/integration/cluster-assignment.test.ts` |
| Failure Signal | AI 输入仍为候选组列表、未授权 pair 被接受、链式 pair 被直接合并 |
| Determinism | deterministic |
| Re-run Plan | 重新运行类型检查、目标测试、lint 和 diff check |

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | 现有 edge-aware 版本仍让 AI 在候选节点集合上返回合并组，约束粒度可以进一步收敛 |
| Expected Behavior | AI 只确认本地 pair；多组合并由后端基于 approved pair 保守组装 |
| Root Cause | 合并决策接口仍是 group-level，AI 需要在候选集合内组织关系 |
| Fix Hypothesis | 将 AI 决策接口改为 pair-level，可降低误组合空间，并保留多组合并能力 |
| Regression Validation | `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/unit/ai-provider.test.ts tests/integration/cluster-assignment.test.ts` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/config/prompts.ts`
- `src/lib/ai/provider.ts`
- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `tests/unit/ai-provider.test.ts`
- `tests/unit/cluster-merge-candidates.test.ts`
- `tests/integration/cluster-assignment.test.ts`

## Execution

- 调整默认聚合合并系统提示词和用户提示词，要求 AI 输出 `approvedPairs`。
- 将 `buildClusterMergeInput` 改为序列化本地 allowed pair，每个 pair 包含左右聚合组详情和本地分数。
- provider 解析新输入 metadata，校验 AI 返回 pair 必须存在于本地 pair 输入。
- provider 将 approved pair 组装成 target-direct merge group，避免仅靠链式传递扩大合并范围。
- provider 在 AI 返回 pair 格式字段时以 pair 结果为准，避免 `approvedPairs: []` 被旧格式字段覆盖。
- service 在无 pair 时直接跳过 AI，并继续在执行前用本地 edge 过滤来源。

### Changed Files

| File | Change |
| --- | --- |
| `src/config/prompts.ts` | 聚合合并提示词改为 pair-level confirmation，输出 `approvedPairs` |
| `src/lib/clusters/helpers.ts` | AI 输入改为 `{ pairs: [{ left, right, score }] }` |
| `src/lib/ai/provider.ts` | 解析 pair 输入、校验 approved pair、组装保守 merge groups |
| `src/lib/clusters/service.ts` | 无 allowed pair 时跳过 AI，执行前保留本地 edge guard |
| `tests/unit/ai-provider.test.ts` | 覆盖 approved pair 组装、未授权 pair 跳过和空 approvedPairs 不回退旧格式 |
| `tests/unit/cluster-merge-candidates.test.ts` | 更新 AI 输入结构断言 |
| `tests/integration/cluster-assignment.test.ts` | 更新聚合合并 AI mock 对 pair 输入的断言 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/unit/ai-provider.test.ts tests/integration/cluster-assignment.test.ts` | pass | 3 files, 38 tests passed |
| `npm test -- tests/integration/admin-settings-api.test.ts tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` | pass | 5 files, 58 tests passed |
| `npm run lint` | pass | 0 errors；保留既有 `_props` unused warning |
| `git diff --check` | pass | 无 whitespace error |
| `npx @shawnxie666/forge-loop validate --slug "将聚合合并从候选组自由识别改为-pair-level-ai-确认-并由后端按-approved-pair-组装多组合并"` | pass | quick task artifact 校验通过 |

## Result

done

## Follow-ups

- 生产若已配置自定义聚合合并 system prompt，需要同步更新配置，否则运行时会继续使用数据库中的旧 system prompt。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 对 3 个及以上聚合组，本次采用保守 target-direct 组装，不做纯链式传递合并。

## Risks

- 如果真实同一事件只形成链式 pair，可能需要后续批次或额外直连 pair 才能完全合并；这是为降低误合并风险接受的召回损失。

## Validation

- 已通过 Commands Run 中列出的新运行命令验证。
- Completion claim is based on the fresh command results in Commands Run.
