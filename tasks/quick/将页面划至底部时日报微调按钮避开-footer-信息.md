---
forge_loop: true
artifact: quick-task
slug: 将页面划至底部时日报微调按钮避开-footer-信息
status: done
mode: quick
blocking: false
---

# Quick Task: 将页面划至底部时日报微调按钮避开-footer-信息

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 将页面划至底部时日报微调按钮避开 footer 信息 |
| Owner | Codex |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 调整日报详情页底部悬浮“日报微调”按钮，使页面滚动到底部时不遮挡 footer 信息。

## Out of Scope

- 不调整 footer 全局布局、不改变弹窗交互和日报微调业务逻辑。

## Acceptance

- footer 进入视口时，悬浮“日报微调”按钮淡出并不可点击、不可聚焦；离开 footer 后按钮恢复显示。

| Field | Value |
| --- | --- |
| Loop Type | static check |
| Command | `npx tsc --noEmit && npm run lint` |
| Failure Signal | 类型错误、lint error 或浏览器 API 使用不合法。 |
| Determinism | deterministic |
| Re-run Plan | 修改按钮避让逻辑后重新运行静态检查。 |

| Field | Value |
| --- | --- |
| Repro Steps | 打开日报详情页并滚动到页面底部 footer 区域。 |
| Observed Failure | 固定在底部中间的“日报微调”按钮遮挡 footer 文案。 |
| Expected Behavior | footer 信息可见时按钮避开，不遮挡 footer。 |
| Root Cause | 按钮使用 `fixed bottom-6` 固定定位，不感知 footer 是否进入视口。 |
| Fix Hypothesis | 使用 `IntersectionObserver` 监听页面 footer；footer 可见时淡出按钮并移除点击、聚焦能力。 |
| Regression Validation | 静态检查通过。 |
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

## Execution

- Add local footer visibility state.
- Observe the page footer in a client-side effect.
- Fade out and disable focus/click on the floating refinement button when footer is visible.
- Run static checks.

### Changed Files

| File | Change |
| --- | --- |
| `src/components/daily/daily-report-detail.tsx` | 增加 footer 可见性监听，并在 footer 可见时隐藏底部悬浮“日报微调”按钮。 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | 类型检查通过。 |
| `npm run lint` | pass with warning | 仅保留既有 `src/components/admin/admin-page-client.tsx:133` `_props` 未使用 warning。 |
| `npx @shawnxie666/forge-loop validate --slug 将页面划至底部时日报微调按钮避开-footer-信息` | pass | Quick Task 工作流产物校验通过。 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- “避开 footer”按不遮挡 footer 信息处理；footer 可见时隐藏按钮比全局抬高 footer 或增加所有页面底部留白更局部。

## Risks

- 未做浏览器截图验证；逻辑依赖现代浏览器的 `IntersectionObserver`，当前目标浏览器环境应支持。

## Validation

- `npx tsc --noEmit` passed.
- `npm run lint` passed with one existing warning.
- Completion claim is based on the fresh command results in Commands Run.
