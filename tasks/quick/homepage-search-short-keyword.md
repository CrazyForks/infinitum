---
forge_loop: true
artifact: quick-task
slug: homepage-search-short-keyword
status: done
mode: fix
blocking: false
---

# Quick Task: homepage-search-short-keyword

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 主页全文搜索关键字蚂蚁搜不出来但蚂蚁集团可以 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复主页 feed 全文搜索中 2 字中文短词无法命中的问题。
- 保持现有 FTS5 trigram 搜索路径，同时增加安全的 LIKE 子串兜底。

## Out of Scope

- 不改前端筛选交互。
- 不重建 FTS tokenizer 或改数据库 schema。

## Acceptance

- `title=蚂蚁` 能命中标题或摘要中包含 `蚂蚁集团` 的条目。
- `title=蚂蚁集团` 等 3 字以上中文搜索仍保留 FTS5 能力。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/integration/feed-api.test.ts` |
| Failure Signal | FTS5 trigram 对 2 字中文短词不能稳定命中 |
| Determinism | deterministic |
| Re-run Plan | 构造 `蚂蚁集团发布 AI 助手` 条目，调用 `/api/feed?range=7d&title=蚂蚁` |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 主页搜索参数进入 `/api/feed`，`resolveFeedRequest` 将 `title` 作为高级筛选，`listFeedItems` 用 `items_fts MATCH` 过滤候选 item |
| Observed Failure | `items_fts` 使用 `tokenize='trigram'`，短于 3 字的中文关键词如 `蚂蚁` 不会像 `蚂蚁集团` 一样命中 |
| Expected Behavior | 全文搜索支持短中文实体词，能按标题、摘要、正文和聚合展示文本做子串匹配 |
| Root Cause | 搜索候选集只通过 FTS5 trigram inner join 过滤，缺少短 CJK 关键词的非 FTS 兜底 |
| Fix Hypothesis | 将 FTS inner join 改为候选 where 条件，并追加转义后的 `LIKE` OR 条件覆盖 item 和 cluster 文本字段 |
| Regression Validation | `npx vitest run tests/integration/feed-api.test.ts` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Files Likely Touched

- `src/lib/feed/repository.ts`
- `tests/integration/feed-api.test.ts`

## Execution

- 增加 `sanitizeLikeQuery`，转义 `%`、`_` 和反斜杠。
- 在 feed 候选 CTE 中保留 FTS5 子查询，并用 `LIKE` 覆盖 item 标题、作者、摘要、正文、聚合标题和聚合摘要。
- 增加短中文关键词集成测试。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/feed/repository.ts` | feed 搜索候选条件新增 LIKE 兜底，避免 trigram 漏掉 2 字中文词 |
| `tests/integration/feed-api.test.ts` | 新增 `蚂蚁` 命中 `蚂蚁集团发布 AI 助手` 的集成测试 |
| `tasks/quick/homepage-search-short-keyword.md` | 记录 Quick Lane fix 证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "主页全文搜索关键字蚂蚁搜不出来但蚂蚁集团可以" --json` | pass | Quick Lane, low risk, small scope, no contract impact |
| `npx @shawnxie666/forge-loop scaffold quick --slug homepage-search-short-keyword --request "主页全文搜索关键字蚂蚁搜不出来但蚂蚁集团可以"` | pass | 生成 quick task |
| `npx vitest run tests/integration/feed-api.test.ts` | pass | 1 file passed, 21 tests passed |
| `npm run lint` | pass | 0 errors；存在既有 warning：`src/components/admin/admin-page-client.tsx:133` `_props` 未使用 |

## Result

done

## Follow-ups

- 如线上搜索量很大，可后续评估中文分词/双字 token 索引方案，替代 LIKE 兜底。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否需要更完整的中文分词索引 | human | no | 本次先修复短词漏搜 |

## Assumptions

- 主页搜索当前的 `title` 参数实际承担“全文搜索”语义，保持兼容不改 URL 参数名。

## Risks

- LIKE 兜底会比纯 FTS 更重，但只在已有 feed 过滤条件后作为搜索条件使用；如数据量继续增大，应评估专门索引。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
