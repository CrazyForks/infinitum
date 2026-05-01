---
forge_loop: true
artifact: quick-task
slug: admin-daily-loading-placeholder
status: done
mode: quick
blocking: false
---

# Quick Task: admin-daily-loading-placeholder

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 简化管理员草稿日报详情加载占位，只显示加载中... |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 将草稿日报详情页的加载态从完整空状态卡片改为轻量文本占位。
- 同步更新组件测试断言。

## Out of Scope

- 不修改日报详情的数据加载流程。
- 不修改真正不存在日报时的空状态卡片。
- 不修改浏览器 tab metadata 逻辑。

## Acceptance

- 管理员草稿日报客户端鉴权和详情读取期间只显示 `加载中...`。
- 加载期间不出现 `日报不存在`。
- 草稿详情读取完成后仍正常显示日报内容和管理员操作入口。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/components/daily-report-detail.test.tsx` |
| Failure Signal | 加载态仍渲染 `正在加载日报` 或 `日报不存在` |
| Determinism | deterministic |
| Re-run Plan | 修改后重新运行组件测试、lint 和 TypeScript 检查 |

| Field | Value |
| --- | --- |
| Repro Steps | 访问管理员可见但公开不可见的草稿日报详情页 |
| Observed Failure | 加载态复用空状态卡片，视觉上偏重且突兀 |
| Expected Behavior | 加载态只显示轻量 `加载中...` 占位 |
| Root Cause | `DailyReportUnavailable` 将加载态和不存在态合并渲染为同一张提示卡片 |
| Fix Hypothesis | 在 `isLoading` 为 true 时提前返回轻量文本占位，保留不存在态原卡片 |
| Regression Validation | `npm test -- tests/components/daily-report-detail.test.tsx` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/components/daily/daily-report-detail.tsx`
- `tests/components/daily-report-detail.test.tsx`

## Execution

- 在加载态分支提前返回轻量占位。
- 保留日报不存在时的原空状态内容。
- 更新组件测试，断言加载期间显示 `加载中...` 且不显示 `日报不存在`。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/daily/daily-report-detail.tsx` | `DailyReportUnavailable` 的加载态改为简单文本占位 |
| `tests/components/daily-report-detail.test.tsx` | 更新加载态断言 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- tests/components/daily-report-detail.test.tsx` | pass | 1 file / 3 tests |
| `npx eslint src/components/daily/daily-report-detail.tsx tests/components/daily-report-detail.test.tsx` | pass | N/A |
| `npx tsc --noEmit` | pass | N/A |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- `加载中...` 使用纯文本占位即可，不需要 spinner 或按钮。

## Risks

- 这是展示层小改动，风险低。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
