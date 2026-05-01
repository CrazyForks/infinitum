---
forge_loop: true
artifact: quick-task
slug: cluster-search-chinese-recall
status: done
mode: fix
blocking: false
---

# Quick Task: cluster-search-chinese-recall

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 排查并优化中文模糊搜索召回：手动加入聚合组中的基于聚合组名称搜索、聚合管理中的关键词筛选、聚合详情-合并聚合组中的搜索聚合组标题 |
| Owner | codex |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 优化聚合组搜索匹配逻辑，使中文关键词支持空格/标点折叠和有序非连续简称匹配。
- 让聚合管理和手动加入聚合组在搜索时通过 `/api/admin/clusters?search=...` 走后端数据库过滤和分页，避免只在第一页结果里搜索。
- 让聚合详情的合并聚合组弹窗使用独立后端搜索候选池。
- 为三个聚合搜索输入统一增加 500ms 防抖，减少慢速输入时的重复请求。
- Admin clusters API 默认不限制 `itemCount`；需要多条目列表时由前端传通用 `minItemCount=2`，未来可扩展到 3/5 等阈值。

## Out of Scope

- 不调整聚合归组、合并业务语义。
- 不修改数据库 schema 或新增依赖。

## Acceptance

- `AI代理` 能匹配 `AI 代理` 这类空格/标点差异。
- `开模` 能匹配 `开源大模型` 这类中文有序简称。
- 聚合管理、手动加入聚合组、合并聚合组弹窗的搜索不再局限于当前第一页已加载聚合，并保持 admin clusters 列表的数据库分页。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 聚合组 | 项目现有内容聚合实体 |
| 聚合管理 | 后台内容审核中的聚合管理视图 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/unit/search.test.ts tests/integration/admin-cluster-api.test.ts` |
| Failure Signal | 中文关键词只能连续子串匹配；部分入口只对第一页聚合做前端过滤 |
| Determinism | deterministic |
| Re-run Plan | 重新运行 TypeScript、搜索/API 测试和相关组件测试 |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 阅读三个入口代码路径：`visibleClusterOptions`、`visibleClusters`、`availableClustersForMerge` |
| Observed Failure | 三处都使用 `toLowerCase().includes()`；手动加入聚合组和合并弹窗候选来自默认分页结果；初版修复曾在 search 分支退化成应用层分页，已改回数据库分页 |
| Expected Behavior | 中文关键词应支持更宽松召回，且搜索应覆盖后端候选集 |
| Root Cause | 搜索实现是精确连续子串匹配，且候选加载范围被默认分页截断 |
| Fix Hypothesis | 提供共享 fuzzy matcher，并为 admin clusters API 增加可表达为 Prisma where 的搜索参数，由数据库先过滤、count、take/skip |
| Regression Validation | `npx tsc --noEmit`、相关 vitest、局部 eslint 均通过 |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

N/A

## Files Likely Touched

- `src/lib/utils/search.ts`
- `src/lib/feed/repository.ts`
- `src/app/api/admin/clusters/route.ts`
- `src/components/feed/feed-panel*`
- `src/components/admin/content-review-panel*`
- `tests/**`

## Execution

- 新增通用中文 fuzzy search helper。
- 扩展 admin clusters API 的 `search` 参数并在服务端过滤后分页。
- 手动加入聚合组、聚合管理、合并聚合组弹窗改用共享 matcher 和后端搜索候选。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/utils/search.ts` | 新增搜索规范化、空格/标点折叠、中文有序简称匹配 |
| `src/config/constants.ts` | 新增管理端聚合搜索防抖常量 |
| `src/lib/feed/repository.ts` | `listAdminClusters` 支持数据库搜索过滤后分页 |
| `src/app/api/admin/clusters/route.ts` | 接收 `search` 和 `minItemCount` 查询参数 |
| `src/components/feed/feed-panel.api.ts` | 聚合组选项请求支持搜索参数，不限制条目数 |
| `src/components/feed/feed-panel.tsx` | 手动加入聚合组弹窗按输入远程搜索并本地 fuzzy 过滤 |
| `src/components/admin/content-review-panel.api.ts` | 聚合管理请求支持搜索和通用最小条目数参数 |
| `src/components/admin/content-review-panel.tsx` | 聚合管理和合并弹窗使用后端搜索候选与 fuzzy matcher |
| `tests/unit/search.test.ts` | 覆盖中文 fuzzy 搜索 |
| `tests/integration/admin-cluster-api.test.ts` | 覆盖 admin clusters 中文搜索 |
| `tests/components/feed-panel.test.tsx` | 适配聚合组选项搜索 URL |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | TypeScript 检查通过 |
| `npx vitest run tests/unit/search.test.ts tests/integration/admin-cluster-api.test.ts` | pass | 2 files, 9 tests passed |
| `npx vitest run tests/components/feed-panel.test.tsx` | pass | 1 file, 48 tests passed |
| `npx vitest run tests/components/content-review-panel.test.tsx` | pass | 1 file, 13 tests passed |
| `npx eslint src/lib/utils/search.ts src/lib/feed/repository.ts src/app/api/admin/clusters/route.ts src/components/feed/feed-panel.api.ts src/components/feed/feed-panel.tsx src/components/admin/content-review-panel.api.ts src/components/admin/content-review-panel.tsx tests/unit/search.test.ts tests/integration/admin-cluster-api.test.ts tests/components/feed-panel.test.tsx` | pass | 局部 lint 通过 |
| `npx vitest run tests/components/content-review-panel.test.tsx tests/components/feed-panel.test.tsx tests/unit/search.test.ts tests/integration/admin-cluster-api.test.ts` | pass | 4 files, 71 tests passed |
| `npx eslint src/config/constants.ts src/components/feed/feed-panel.tsx src/components/admin/content-review-panel.tsx` | pass | 防抖相关改动局部 lint 通过 |

## Result

done

## Follow-ups

- N/A

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- 当前聚合组搜索属于管理端低风险查询体验优化，允许在有搜索词时拉取候选后做应用层 fuzzy 过滤。

## Risks

- 当前搜索用 Prisma `contains` 和中文逐字 AND 召回来保持数据库分页；如果后续需要拼音、同义词或更强排序，可加搜索索引或专用 searchKey 字段优化。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
