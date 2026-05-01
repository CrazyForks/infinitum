---
forge_loop: true
artifact: quick-task
slug: admin-daily-draft-metadata-title
status: done
mode: fix
blocking: false
---

# Quick Task: admin-daily-draft-metadata-title

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 修复管理员查看草稿日报时浏览器 tab 标题显示日报不存在 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复 `/daily/[date]` 的 `generateMetadata()`：public 查不到日报时，如果当前请求是管理员 session，则用 admin 视角读取草稿标题。
- 保持草稿日报 metadata 的 `robots` 为 private/noindex。

## Out of Scope

- 不改变公开用户访问草稿日报时的不可见语义。
- 不改变页面正文 hydration 逻辑。
- 不改变 admin API 权限。

## Acceptance

- 管理员查看草稿日报时浏览器 tab 标题显示草稿日报标题。
- 匿名用户访问未发布日报时 tab 仍显示“日报不存在”。
- 草稿 metadata 不被搜索引擎索引。

## Feedback Loop

> Required for `Mode: fix`; recommended for risky quick changes.

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/app/daily-report-metadata.test.ts tests/components/daily-report-detail.test.tsx` |
| Failure Signal | admin 草稿 metadata title 回退为“日报不存在” |
| Determinism | deterministic |
| Re-run Plan | metadata 单测 + 详情组件测试 + 类型检查 + lint |

## Debugging Evidence

> Required for `Mode: fix`; use `N/A` for quick or spike.

| Field | Value |
| --- | --- |
| Repro Steps | 已登录管理员打开未发布草稿日报详情页 |
| Observed Failure | 页面内容最终可见，但浏览器 tab 标题为“日报不存在” |
| Expected Behavior | 管理员请求下 tab 标题使用草稿日报标题 |
| Root Cause | `generateMetadata()` 只按 public 视角调用 `getDailyReportByDate(date, false)`；草稿对 public 返回 null |
| Fix Hypothesis | public 查询为空时读取 `getAdminSession()`，管理员再调用 `getDailyReportByDate(date, true)` |
| Regression Validation | 新增 metadata 单测覆盖管理员草稿标题和匿名 not-found 标题 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Metadata Flow | `generateMetadata()` now tries public report first, then admin-visible report only when admin session exists |
| Privacy | Draft reports still use `PRIVATE_ROBOTS` because status is not `published` |
| Anonymous | Anonymous request does not fetch admin detail and keeps not-found metadata |

## Files Likely Touched

- `src/app/daily/[date]/page.tsx`
- `tests/app/daily-report-metadata.test.ts`
- `tasks/quick/admin-daily-draft-metadata-title.md`

## Execution

- Import `getAdminSession` in the daily detail page route.
- Extend metadata lookup to admin-visible draft reports when public lookup misses.
- Add regression tests for admin and anonymous metadata paths.

### Changed Files

| File | Change |
| --- | --- |
| `src/app/daily/[date]/page.tsx` | metadata public miss falls back to admin-visible report for admin sessions |
| `tests/app/daily-report-metadata.test.ts` | new metadata tests for admin draft title and anonymous not-found title |
| `tasks/quick/admin-daily-draft-metadata-title.md` | records this fix and validation |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane fix |
| `npx @shawnxie666/forge-loop scaffold quick --slug admin-daily-draft-metadata-title --request ... --mode fix` | pass | 创建任务记录 |
| `npx tsc --noEmit` | pass | 类型检查通过 |
| `npm test -- tests/app/daily-report-metadata.test.ts tests/components/daily-report-detail.test.tsx` | pass | 2 files, 4 tests passed |
| `npx eslint 'src/app/daily/[date]/page.tsx' tests/app/daily-report-metadata.test.ts` | pass | 改动文件 lint 通过 |

## Result

done

## Follow-ups

- 可后续考虑让页面正文 SSR 也在管理员 session 下直接渲染草稿，进一步减少客户端二次请求；本轮先保持 public cache/SEO 语义稳定。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否让管理员草稿正文也走 SSR？ | human | no | 本轮只修 tab metadata |

## Assumptions

- 管理员请求的草稿 metadata 可以显示标题，但仍必须 noindex。

## Risks

- `generateMetadata()` 读取 cookies 后会对该路径 metadata 产生请求态差异；这是修复 admin tab 标题所必需，且草稿保持 noindex。

## Validation

- 已运行 metadata 单测、详情组件测试、类型检查和 lint。
- Completion claim is based on the fresh command results in Commands Run.
