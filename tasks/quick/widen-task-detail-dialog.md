---
forge_loop: true
artifact: quick-task
slug: widen-task-detail-dialog
status: done
mode: quick
blocking: false
---

# Quick Task: widen-task-detail-dialog

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 将任务详情弹窗的宽度设置宽一点，避免聚合合并摘要换行 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 仅调整管理页任务详情弹窗宽度。

## Out of Scope

- 不调整确认弹窗宽度。
- 不改任务 timeline 数据结构和摘要文案。

## Acceptance

- 任务详情弹窗在桌面视口更宽，聚合合并 timeline 摘要有更多横向空间。

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/components/task-monitor-panel.test.tsx` |
| Failure Signal | 任务详情弹窗渲染或交互测试失败 |
| Determinism | deterministic |
| Re-run Plan | 修改后串行运行组件测试和 workflow validate |

| Field | Value |
| --- | --- |
| Repro Steps | 打开管理页任务详情弹窗，查看聚合合并 timeline 摘要 |
| Observed Failure | 聚合合并新增指标较多，`max-w-2xl` 下容易换行 |
| Expected Behavior | 任务详情弹窗更宽，摘要获得更多横向空间 |
| Root Cause | `TaskDetailModal` 使用 `ModalShell` 的 `widthClassName=\"max-w-2xl\"` |
| Fix Hypothesis | 将任务详情弹窗宽度提升到 `max-w-5xl`，保持移动端 `w-full` 响应式约束 |
| Regression Validation | `npm test -- tests/components/task-monitor-panel.test.tsx` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/components/admin/task-monitor-panel.tsx`

## Execution

- 将 `TaskDetailModal` 的 `widthClassName` 从 `max-w-2xl` 调整为 `max-w-5xl`。

### Changed Files

| File | Change |
| --- | --- |
| `src/components/admin/task-monitor-panel.tsx` | 放宽任务详情弹窗最大宽度 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "将任务详情弹窗的宽度设置宽一点，避免聚合合并摘要换行" --json` | pass | Quick Lane, low risk |
| `npx @shawnxie666/forge-loop scaffold quick --slug widen-task-detail-dialog --request "将任务详情弹窗的宽度设置宽一点，避免聚合合并摘要换行"` | pass | 生成 quick task |
| `npm test -- tests/components/task-monitor-panel.test.tsx` | pass | 4 tests passed |
| `npx @shawnxie666/forge-loop validate --slug widen-task-detail-dialog` | pass | quick task artifact valid |
| `git diff --check` | pass | 无 whitespace error |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- `max-w-5xl` 对任务详情足够，且 `ModalShell` 的 `w-full` 和 overlay padding 会继续保护小屏布局。

## Risks

- 桌面弹窗更宽，占用更多横向视口；该变化只作用于任务详情弹窗。

## Validation

- `npm test -- tests/components/task-monitor-panel.test.tsx` 通过。
- `npx @shawnxie666/forge-loop validate --slug widen-task-detail-dialog` 通过。
- `git diff --check` 通过。
- Completion claim is based on the fresh command results in Commands Run.
