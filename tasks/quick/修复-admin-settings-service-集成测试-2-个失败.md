---
forge_loop: true
artifact: quick-task
slug: 修复-admin-settings-service-集成测试-2-个失败
status: done
mode: quick
blocking: false
---

# Quick Task: 修复-admin-settings-service-集成测试-2-个失败

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 修复 npm test -- tests/integration/admin-settings-service.test.ts 的 2 个失败 |
| Owner | Codex |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复 `getAdminSettings()` 返回空 `sources` 导致 admin settings 集成测试失败的问题。
- 恢复 admin settings 快照里的来源列表、分组名和每个来源最新 item 创建时间。

## Out of Scope

- 不调整来源 CRUD、分页来源 API、数据库 schema 或默认 seed 逻辑。

## Acceptance

- `npm test -- tests/integration/admin-settings-service.test.ts` 通过。
- `getAdminSettings()` 能返回默认来源，且能返回指定来源的 `lastItemCreatedAt`。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/integration/admin-settings-service.test.ts` |
| Failure Signal | 2 failed: `lastItemCreatedAt` 为 `undefined`；默认 sources 长度为 0。 |
| Determinism | deterministic |
| Re-run Plan | 修复后重跑同一集成测试文件。 |

| Field | Value |
| --- | --- |
| Repro Steps | 运行 `npm test -- tests/integration/admin-settings-service.test.ts`。 |
| Observed Failure | `includes each source latest item ingestion time...` 和 `does not reseed default sources...` 失败。 |
| Expected Behavior | Admin settings 快照应包含 sources，并为有 item 的 source 返回最新 `createdAt`。 |
| Root Cause | `getAdminSettings()` 当前硬编码 `sources: []`，没有序列化 source 列表，也没有聚合最新 item 时间。 |
| Fix Hypothesis | 在 `getAdminSettings()` 中查询 sources、include group，并按 sourceId `groupBy` item 最新 `createdAt` 后序列化。 |
| Regression Validation | `npm test -- tests/integration/admin-settings-service.test.ts` 通过。 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/settings/runtime-service.ts`

## Execution

- Reproduce failing integration test.
- Restore source serialization in `getAdminSettings()`.
- Re-run target test, typecheck, lint, and workflow validation.

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/settings/runtime-service.ts` | `getAdminSettings()` now returns sources with group metadata and latest item creation time. |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- tests/integration/admin-settings-service.test.ts` | fail then pass | Reproduced 2 failures, then passed 11 tests after fix. |
| `npx tsc --noEmit` | pass | Type check passed. |
| `npm run lint` | pass with warning | Existing warning: `src/components/admin/admin-page-client.tsx:133:33 '_props' is defined but never used`. |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- Admin settings snapshot should mirror the source shape already declared in `AdminSettingsSnapshot`.

## Risks

- `getAdminSettings()` now does one extra source query and one grouped latest-item query; this is acceptable for admin settings snapshot usage.

## Validation

- Target integration test now passes.
- Typecheck and lint were run.
- Completion claim is based on the fresh command results in Commands Run.
