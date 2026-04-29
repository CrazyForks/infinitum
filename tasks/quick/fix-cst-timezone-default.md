---
forge_loop: true
artifact: quick-task
slug: fix-cst-timezone-default
status: draft
mode: quick
blocking: false
---

# Quick Task: fix-cst-timezone-default

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 将项目所有时间处理默认调整为东8区吧，特别是检查主页和日报列表，主页列表会进行自动时区偏移，这个逻辑可以去掉，固定为东八区就行 |
| Owner | human |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | none |

## Scope

- 将 Feed 默认日期边界固定为东八区。
- 去掉主页列表基于浏览器本地时区自动重载与 `tzOffsetMinutes` 请求参数。
- 统一日报列表默认生成日期与日报详情时间展示为东八区。

## Out of Scope

- 不调整后台任务调度、管理后台表单输入等其他原生日期控件行为。
- 不修改数据库中已存储的时间值，只调整默认解释与展示方式。

## Acceptance

- 主页 Feed 不再因访问者浏览器时区不同而切换时间筛选边界或触发 hydration 重载。
- 日报列表默认生成日期固定使用 Asia/Shanghai 当天。
- 日报详情页“生成时间”固定按东八区展示。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| Feed | 主页公共资讯流，来源于 `.ai/project-context.md` / `CLAUDE.md` |
| Daily Report | AI 日报列表与详情页，来源于 `CLAUDE.md` |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/unit/feed-range.test.ts tests/unit/daily-report.test.ts tests/components/feed-panel.test.tsx tests/integration/feed-api.test.ts` |
| Failure Signal | Feed 请求仍携带 `tzOffsetMinutes`、Feed 日期边界非东八区、日报时间展示仍受浏览器时区影响 |
| Determinism | deterministic |
| Re-run Plan | 重新执行同一组 vitest，用例覆盖主页列表请求、东八区边界与日报时间格式 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | 主页 Feed 会把浏览器 `getTimezoneOffset()` 附加到请求参数中，导致列表按访问者本地时区切分日期边界；日报详情时间使用浏览器默认时区格式化 |
| Expected Behavior | 默认固定为东八区，浏览器时区不应改变主页和日报页时间解释 |
| Root Cause | Feed 请求构造与 hydration 补拉逻辑显式依赖浏览器时区；日报组件局部使用 `toLocaleString("zh-CN")` 且未指定时区 |
| Fix Hypothesis | 将 Feed 默认边界改为固定 `UTC+8`，移除客户端时区补偿参数与重载逻辑，并将日报页的日期来源/格式化统一到 `Asia/Shanghai` |
| Regression Validation | `vitest` 目标用例全部通过，且首页不再有 hydration 时区重载测试需求 |
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

- `src/lib/feed/*`
- `src/components/feed/*`
- `src/lib/daily-report/date.ts`
- `src/components/daily/*`
- `tests/unit/*`
- `tests/integration/feed-api.test.ts`
- `tests/components/feed-panel.test.tsx`

## Execution

- 固定 Feed 默认日期边界到东八区。
- 去掉主页基于浏览器时区的 URL 参数和 hydration 重拉。
- 统一日报日期/时间工具并补充回归测试。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/feed/range.ts` | 将 Feed 默认日期边界改为固定东八区 |
| `src/lib/feed/request.ts` | 停止读取 `tzOffsetMinutes` 请求参数 |
| `src/components/feed/feed-panel.utils.ts` | 移除主页请求中的浏览器时区参数 |
| `src/components/feed/feed-panel.tsx` | 移除客户端 hydration 时区重拉逻辑 |
| `src/lib/daily-report/date.ts` | 抽出东八区日期时间格式化工具 |
| `src/components/daily/daily-report-list.tsx` | 默认生成日期统一走东八区当天 |
| `src/components/daily/daily-report-detail.tsx` | 详情页生成时间固定显示为东八区 |
| `tests/unit/feed-range.test.ts` | 更新 Feed 默认边界断言为东八区 |
| `tests/unit/daily-report.test.ts` | 新增日报时间格式化断言 |
| `tests/integration/feed-api.test.ts` | 更新自定义日期与当天筛选的东八区断言 |
| `tests/components/feed-panel.test.tsx` | 移除旧的浏览器时区参数断言并验证不再 hydration 重拉 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm run db:test:setup` | pass | 重建测试 SQLite 并重新生成 Prisma Client |
| `npx vitest run tests/unit/feed-range.test.ts tests/unit/daily-report.test.ts tests/components/feed-panel.test.tsx tests/integration/feed-api.test.ts` | pass | 4 个文件、77 个用例全部通过 |
| `npx eslint src/lib/feed/range.ts src/lib/feed/request.ts src/components/feed/feed-panel.utils.ts src/components/feed/feed-panel.tsx src/lib/daily-report/date.ts src/components/daily/daily-report-list.tsx src/components/daily/daily-report-detail.tsx tests/unit/feed-range.test.ts tests/unit/daily-report.test.ts tests/integration/feed-api.test.ts tests/components/feed-panel.test.tsx` | pass | 本轮修改文件无 lint 问题 |

## Result

done

## Follow-ups

- 如后续要扩大“全站统一东八区”，可继续检查管理后台日期筛选与原生 `datetime-local` 表单是否也要收口到统一工具。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 用户提到的“所有时间处理默认调整为东8区”当前优先覆盖主页 Feed 与日报列表/详情这两条最直接的公共浏览路径。

## Risks

- 仍有部分后台页面使用原生本地日期控件；若后续希望连管理端也完全固定东八区，需要单独梳理这些表单行为。

## Validation

- 通过目标 `vitest` 用例验证 Feed 默认边界、主页请求构造、hydration 行为和日报时间格式。
- 通过 `eslint` 验证本轮修改没有引入静态检查问题。
- Completion claim is based on the fresh command results in Commands Run.
