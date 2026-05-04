---
forge_loop: true
artifact: quick-task
slug: 修复本地-docker-环境调整聚合合并提示词时报-type-invalid-value-补齐提示词类型校验枚举
status: done
mode: quick
blocking: false
---

# Quick Task: 修复本地-docker-环境调整聚合合并提示词时报-type-invalid-value-补齐提示词类型校验枚举

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 修复本地 Docker 环境调整聚合合并提示词时报 type invalid_value，补齐提示词类型校验枚举 |
| Owner | human |
| Created | 2026-05-04 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复 admin prompt config create/update API 的 `type` Zod 枚举。
- 将提示词类型枚举统一到 `PROMPT_CONFIG_TYPES`，避免 route 手写列表漏新增类型。
- 增加 API 测试覆盖 `cluster_merge` 创建和更新。

## Out of Scope

- 不修改提示词保存业务规则。
- 不修改数据库 schema。
- 不处理其他任务 AI breakdown 类型。

## Acceptance

- 保存 `cluster_merge` 提示词时不再返回 `invalid_value`。
- create 和 update 两个提示词配置接口都接受完整提示词类型列表。
- 未来新增提示词类型时可复用同一个类型常量。

| Field | Value |
| --- | --- |
| Loop Type | CLI |
| Command | `npm test -- tests/integration/admin-settings-api.test.ts tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts` |
| Failure Signal | `type: "cluster_merge"` 被 route schema 拒绝 |
| Determinism | deterministic |
| Re-run Plan | 重新运行类型检查、API/设置相关测试、lint 和 diff check |

| Field | Value |
| --- | --- |
| Repro Steps | 在本地 Docker 管理端保存聚合合并提示词，payload type 为 `cluster_merge` |
| Observed Failure | Zod 报 `Invalid option: expected one of "item_summary"|"item_analysis"|"cluster_summary"|"cluster_match"|"daily_report"` |
| Expected Behavior | API 接受 `cluster_merge` 和其他已支持的提示词类型 |
| Root Cause | `src/app/api/admin/settings/prompt-configs` create/update route 中的 `z.enum` 仍是旧手写列表，漏了新增提示词类型 |
| Fix Hypothesis | 将 route schema 改为复用 `PROMPT_CONFIG_TYPES`，并用 API 测试锁住 `cluster_merge` |
| Regression Validation | `npm test -- tests/integration/admin-settings-api.test.ts tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/settings/types.ts`
- `src/app/api/admin/settings/prompt-configs/route.ts`
- `src/app/api/admin/settings/prompt-configs/[id]/route.ts`
- `tests/integration/admin-settings-api.test.ts`

## Execution

- Export `PROMPT_CONFIG_TYPES` from settings types and derive `PromptConfigType` from it.
- Use `z.enum(PROMPT_CONFIG_TYPES)` in create/update prompt config routes.
- Add integration tests for creating and updating `cluster_merge` prompt configs.

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/settings/types.ts` | 增加运行时可复用的完整提示词类型常量 |
| `src/app/api/admin/settings/prompt-configs/route.ts` | create schema 使用完整类型常量 |
| `src/app/api/admin/settings/prompt-configs/[id]/route.ts` | update schema 使用完整类型常量 |
| `tests/integration/admin-settings-api.test.ts` | 覆盖 `cluster_merge` create/update |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/integration/admin-settings-api.test.ts tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts` | pass | 3 files, 37 tests passed |
| `npm run lint` | pass | 0 errors；保留既有 `_props` unused warning |
| `git diff --check` | pass | 无 whitespace error |
| `npx @shawnxie666/forge-loop validate --slug "修复本地-docker-环境调整聚合合并提示词时报-type-invalid-value-补齐提示词类型校验枚举"` | pass | quick task artifact 校验通过 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 报错来自 prompt config save API，而不是 Docker compose 或 Prisma enum。

## Risks

- 其他手写枚举若未来新增类型仍可能遗漏；本次已把当前 prompt config API 的入口统一到常量。

## Validation

- 已通过 Commands Run 中列出的新运行命令验证。
- Completion claim is based on the fresh command results in Commands Run.
