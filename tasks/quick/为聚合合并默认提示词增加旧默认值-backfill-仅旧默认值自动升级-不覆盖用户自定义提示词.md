---
forge_loop: true
artifact: quick-task
slug: 为聚合合并默认提示词增加旧默认值-backfill-仅旧默认值自动升级-不覆盖用户自定义提示词
status: done
mode: quick
blocking: false
---

# Quick Task: 为聚合合并默认提示词增加旧默认值-backfill-仅旧默认值自动升级-不覆盖用户自定义提示词

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 为聚合合并默认提示词增加旧默认值 backfill：仅旧默认值自动升级，不覆盖用户自定义提示词 |
| Owner | human |
| Created | 2026-05-04 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | route phrase with "安全 backfill" was a false positive for security; rerouted as low-risk default prompt backfill |

## Scope

- 为 `cluster_merge` 默认提示词增加旧默认值 backfill。
- 只在记录仍精确等于旧版默认 system prompt、旧版默认 user prompt、默认采样参数、默认名称、`isDefault=true` 时升级。
- 同时兼容上一版 edge-aware 默认 system prompt，避免中间版本部署后无法升级到 pair-level 默认。
- 增加测试覆盖“旧默认会升级”和“自定义不会被覆盖”。

## Out of Scope

- 不覆盖用户自定义聚合合并提示词。
- 不修改非 `cluster_merge` 提示词升级策略。
- 不直接操作生产数据。

## Acceptance

- 现有默认聚合合并提示词可自动升级为 pair-level 新默认。
- 用户改过 system prompt 的聚合合并配置保持原样。
- 如果已经不是旧默认 user prompt 或默认采样参数，也不会被本次 backfill 误匹配。

| Field | Value |
| --- | --- |
| Loop Type | CLI |
| Command | `npm test -- tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` |
| Failure Signal | 旧默认未升级，或自定义提示词被覆盖 |
| Determinism | deterministic |
| Re-run Plan | 重新运行类型检查、目标测试、lint、diff check |

| Field | Value |
| --- | --- |
| Repro Steps | 先 seed 默认配置，再把默认 `cluster_merge` 记录改回旧默认 system prompt 和旧 user prompt，运行 `ensureRuntimeConfigSeeded()` |
| Observed Failure | 代码默认提示词更新后，已有数据库默认记录不会自动覆盖 |
| Expected Behavior | 未改动旧默认值自动升级；自定义值不动 |
| Root Cause | seed 逻辑只对少量历史默认提示词有显式 legacy backfill，未覆盖 `cluster_merge` |
| Fix Hypothesis | 增加精确 legacy where 条件和 updateMany，并用测试锁住“不覆盖自定义” |
| Regression Validation | `npm test -- tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/settings/core.ts`
- `tests/integration/admin-settings-service.test.ts`

## Execution

- 增加旧版 group-level 聚合合并默认 system prompt 常量和旧 user prompt 常量。
- 增加 edge-aware 中间默认 system prompt 常量，作为同样可升级的旧默认。
- 在 seed early-return 检查中加入 legacy cluster merge count。
- 在 transaction 中对精确匹配的旧默认 `cluster_merge` 更新 system prompt、user prompt 和采样参数。
- 增加 settings integration tests。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/settings/core.ts` | 增加 `cluster_merge` 旧默认提示词安全 backfill |
| `tests/integration/admin-settings-service.test.ts` | 覆盖旧默认升级和自定义不覆盖 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` | pass | 4 files, 51 tests passed |
| `npm run lint` | pass | 0 errors；保留既有 `_props` unused warning |
| `git diff --check` | pass | 无 whitespace error |
| `npx @shawnxie666/forge-loop validate --slug "为聚合合并默认提示词增加旧默认值-backfill-仅旧默认值自动升级-不覆盖用户自定义提示词"` | pass | quick task artifact 校验通过 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 旧默认值通过精确字符串匹配识别；只要用户改过 system prompt 或 user prompt，就视为自定义并保留。

## Risks

- 如果生产默认提示词被人工改动过但仍希望升级，需要管理员手动同步；自动 backfill 不会覆盖这种情况。

## Validation

- 已通过 Commands Run 中列出的新运行命令验证。
- Completion claim is based on the fresh command results in Commands Run.
