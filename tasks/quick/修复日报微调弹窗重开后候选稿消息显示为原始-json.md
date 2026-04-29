---
forge_loop: true
artifact: quick-task
slug: 修复日报微调弹窗重开后候选稿消息显示为原始-json
status: in_progress
mode: fix
blocking: false
---

# Quick Task: 修复日报微调弹窗重开后候选稿消息显示为原始 JSON

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 退出重新打开日报微调弹窗后，草稿按钮变成一段 JSON。 |
| Owner | Codex |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复日报微调 session restore 时候选稿消息的展示和预览状态恢复。
- 补充服务层回归测试，覆盖候选稿生成后重新获取 active session 的响应。

## Out of Scope

- 不调整 AI 生成策略、提示词、数据库 schema 或保存语义。

## Acceptance

- 重新打开弹窗后，候选稿消息显示“候选稿已生成，可在预览区检查后保存。”并提供“查看”按钮。
- 不再把候选稿原始 JSON 当成对话气泡展示。
- 已生成但未保存的候选稿可以继续在预览弹窗查看和保存。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 日报微调 | 当前功能名称 |
| 候选稿 | 生成但未保存的日报候选内容 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | screenshot + service test |
| Command | `npm test -- tests/integration/daily-report-service.test.ts -t "restores generated refinement candidates"` |
| Failure Signal | 重开弹窗后 assistant 气泡展示原始 JSON，且没有候选稿查看按钮。 |
| Determinism | deterministic |
| Re-run Plan | 生成候选稿后调用 `/refine/session` 或服务方法恢复 active session。 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 打开 `http://localhost:3001/daily/2026-04-29`，进入日报微调，生成候选稿，退出再打开弹窗。 |
| Observed Failure | 用户截图显示 assistant 气泡中直接渲染 `{"openingSummary":...}` 原始 JSON。 |
| Expected Behavior | 显示候选稿状态文案和“查看”按钮，预览弹窗可查看候选稿。 |
| Root Cause | `getLatestDailyReportRefinementSession()` 只返回 `message.content`；候选稿 message 的 `content` 是 AI 原始 JSON，前端 restore 时不知道该 message 有 `candidateJson`，因此按普通 Markdown 气泡渲染。 |
| Fix Hypothesis | session restore 响应对带 `candidateJson` 的 assistant message 返回标准展示文案，并附带 latest candidate preview；前端据此恢复 `refinementCandidate`。 |
| Regression Validation | 服务层测试 + type/lint/build。 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | N/A |
| Architecture Candidates | N/A |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/daily-report/service.ts`
- `src/components/daily/daily-report.api.ts`
- `src/components/daily/daily-report-detail.tsx`
- `tests/integration/daily-report-service.test.ts`

## Execution

- Extend restored session payload with candidate preview.
- Normalize candidate assistant message content during restore.
- Restore frontend `refinementCandidate` state from session payload.
- Add focused regression test and run targeted validation.

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/daily-report/service.ts` | Restore session response now normalizes assistant candidate messages to the standard candidate-ready text and includes the latest candidate preview payload. |
| `src/components/daily/daily-report.api.ts` | Added optional restored `candidate` field to the refinement session client type. |
| `src/components/daily/daily-report-detail.tsx` | Restores `refinementCandidate` from the session payload so the "查看" button reappears after closing/reopening the dialog. |
| `tests/integration/daily-report-service.test.ts` | Added regression coverage for generated candidate restore without raw JSON chat text. |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm test -- tests/integration/daily-report-service.test.ts -t "restores generated refinement candidates"` | pass | Focused regression: 1 test passed. |
| `npm test -- tests/integration/daily-report-service.test.ts` | pass | 13 tests passed. |
| `npx tsc --noEmit` | pass | Type check passed. |
| `npm run lint` | pass | 0 errors, 1 existing warning at `src/components/admin/admin-page-client.tsx:133`. |
| `npm run build` | pass | Next production build passed. |
| `docker compose up -d --build` | pass | Rebuilt and restarted app/worker containers. |
| `sleep 3 && docker compose ps && curl -I http://localhost:3001/` | pass | App/worker were `Up`; homepage returned `200 OK`. |
| `curl -s -o /tmp/infinitum-daily-2026-04-29.html -w "%{http_code}\n" http://localhost:3001/daily/2026-04-29` | observed 404 | Current Docker data volume did not contain the specific report record after rebuild, so exact browser-page verification was not possible in this environment. |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 候选稿 message 的 `candidateJson` 是当前恢复预览的可信来源，和保存逻辑保持一致。

## Risks

- 如果历史 session 中 candidateJson 已损坏，恢复候选预览应失败关闭，仅不显示预览按钮；不影响普通对话恢复。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
