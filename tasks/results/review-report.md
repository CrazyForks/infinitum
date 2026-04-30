---
forge_loop: true
artifact: review-report
slug: homepage-feed-filter-search-and-summary-fixes
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: homepage-feed-filter-search-and-summary-fixes

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: cluster summary parsing, feed search fallback, homepage filter query UX, quick task records |
| Review Depth | deep |
| Specialist Reviewers | security lightweight, performance lightweight, architecture lightweight |
| Adversarial Pass | done |
| Retrospective | skipped: focused quick iterations |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| 聚合摘要不展示 `{title, summary}` 外壳 | pass | 合法 JSON 仍正常拆分；非法 JSON 会尝试字段级恢复，无法恢复时回退旧摘要而不是展示 raw JSON。 |
| 主页全文搜索支持短中文关键词 | pass | 保留 FTS5 trigram，并增加转义后的 LIKE 兜底覆盖 item 与 cluster 文本字段。 |
| 筛选项变更不自动刷新列表 | pass | 筛选控件只更新草稿状态；点击 `查询` 才调用 `loadFeed(buildQuery())`。 |
| 清除筛选不收起高级筛选 | pass | `clearFilters` 不再修改 `advancedFiltersOpen`。 |
| 清除筛选不刷新列表 | pass | `clearFilters` 只重置控件状态，不调用 `/api/feed`，列表保持到下次点击 `查询`。 |

## Design Compliance

| Area | Result | Notes |
| --- | --- | --- |
| Feed query state | pass | `appliedQuery` / `latestQueryRef` 区分已应用查询和待提交筛选，分页、页大小、阅读进度、聚合展开、后台刷新继续使用已应用查询。 |
| Search implementation | pass | FTS 仍是主要路径；LIKE fallback 只作为短词和 FTS 漏召回兜底。 |
| Summary parsing | pass | 容错集中在 presentation output parser，不改 prompt、不扩散到写库路径。 |
| Workflow artifacts | pass | 5 个 Quick Task 均为 `done`，并已同步后续需求覆盖的最终语义。 |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API | pass | `/api/feed` 参数和响应结构不变。 |
| Types | pass | 仅扩展 `FilterSummary` 可选 `actions?: ReactNode`，无破坏性类型变更。 |
| Auth | N/A | 无权限、登录或管理权限变更。 |
| State | pass | 无 schema、迁移、持久化格式或环境变量变更。 |

## Code Quality

- No Must Fix findings.
- `FilterSummary` 的 `actions` 扩展保持可选，现有调用方兼容。
- `clearFilters` 职责收敛为重置草稿筛选，查询提交只由 `applyFilters` 负责。
- `latestQueryRef.current` 用于非筛选控件触发的列表请求，避免未提交筛选意外影响分页和后台刷新。
- 提交前发现两个 Quick Task 文档仍保留中间态“清除筛选刷新默认列表”的说法，已作为 `safe_auto` 修正。

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | 检查了状态同步、清除筛选、查询按钮、分页、后台刷新、聚合展开和 malformed JSON 恢复路径。 |
| API / Data Breakage | pass | 无外部 API、schema、序列化格式破坏。 |
| Deployability | pass | 无依赖、迁移或环境配置变更。 |
| Observability | N/A | 无新增后台任务或日志指标需求。 |
| Error Handling UX | pass | 搜索和摘要容错失败时采用保守 fallback。 |
| Idempotency / Retry | N/A | 无新增写操作重试语义。 |
| Resource Cleanup | N/A | 无 timer、subscription 或连接生命周期新增。 |
| Dependency Change | N/A | manifest 和 lockfile 未变更。 |

## Autofix Routing

| Class | Count | Action |
| --- | --- | --- |
| safe_auto | 1 | 已修正文档中与最终清除筛选行为冲突的中间态描述。 |
| gated_auto | 0 | N/A |
| manual | 0 | N/A |
| advisory | 1 | LIKE fallback 后续可按线上数据量评估中文分词或双字 token 索引。 |

## Workflow Metrics

| Signal | Value | Notes |
| --- | --- | --- |
| Route | quick + pre-commit review | 5 个用户请求均为 Quick Lane；提交前按 Code Review Skill 检查当前 diff。 |
| Gate Friction | low | 仅有 Quick Task 文档语义同步。 |
| Verification Freshness | fresh | 本轮重新运行目标测试、类型检查、lint、diff check 和 quick task validate。 |
| Rework Signal | medium | 清除筛选语义经历两次用户补充，最终以 `clear-filters-without-reload` 为准。 |
| Template Noise | low | Review report 用于提交前记录实际风险和验证证据。 |

## Follow-ups

| Type | Item | Target | Notes |
| --- | --- | --- | --- |
| data-cleanup | 清理线上已落库的旧脏聚合摘要 | future admin task or script | 本次只修新增/重生成链路。 |
| performance | 评估中文短词搜索索引方案 | future search optimization | 仅当 LIKE fallback 在线上查询量或数据量下成为瓶颈时处理。 |

## Security Review

- Pass. LIKE 查询使用 Prisma 参数绑定并转义 `%`、`_`、反斜杠；未引入用户输入拼接 SQL、鉴权放宽或敏感信息输出。

## Performance Review

- Pass with advisory. LIKE fallback 比纯 FTS 更重，但只在搜索条件存在时启用，且保持现有 feed 过滤上下文；可后续按线上数据量优化。

## Test Coverage

- `npx vitest run tests/components/feed-panel.test.tsx tests/integration/feed-api.test.ts tests/integration/item-regeneration.test.ts` passed: 3 files, 79 tests.
- `npx tsc --noEmit` passed.
- `npm run lint` passed with 0 errors and one existing warning: `src/components/admin/admin-page-client.tsx:133:33 '_props' is defined but never used`.
- `git diff --check` passed.
- `npx @shawnxie666/forge-loop validate --slug homepage-filter-query-button` passed.
- `npx @shawnxie666/forge-loop validate --slug keep-advanced-filters-open-after-clear` passed.
- `npx @shawnxie666/forge-loop validate --slug clear-filters-without-reload` passed.
- `npx @shawnxie666/forge-loop validate --slug homepage-search-short-keyword` passed.
- `npx @shawnxie666/forge-loop validate --slug cluster-summary-json-title` passed.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- 后续按线上数据量评估全文搜索短中文词的专门索引方案。

## Final Recommendation

Approve. 当前 diff 无 Must Fix、无 Security High Risk、无未解释测试失败，可以提交。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否需要清理线上已存在的 JSON 外壳摘要 | human | no | 作为后续数据修复，不阻塞本次提交。 |

## Assumptions

- 主页搜索当前仍复用 `title` 查询参数承载全文搜索语义，本次保持兼容。
- `清除筛选` 的最终语义以最新需求为准：只重置筛选控件，不刷新列表。

## Risks

- 短词 LIKE fallback 在大数据量下可能比纯 FTS 更慢，需要用线上规模观察。
- 清除筛选后筛选摘要会变为默认，但列表仍显示上一次已应用查询结果，直到用户点击 `查询`；这是本次目标交互。

## Validation

- No Must Fix before commit.
- No Security High Risk before commit.
- No unexplained test failure before commit.
- Review Depth classified and specialist/adversarial passes recorded.
