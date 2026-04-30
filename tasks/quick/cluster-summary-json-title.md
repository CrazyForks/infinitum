---
forge_loop: true
artifact: quick-task
slug: cluster-summary-json-title
status: done
mode: fix
blocking: false
---

# Quick Task: cluster-summary-json-title

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | fix |
| Spike Type | N/A |
| Request | 生产环境存在聚合卡片摘要里有 title json 样式 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 修复聚合摘要重生成时模型返回类 JSON 内容被整段写入 `ContentCluster.summary` 的问题。
- 保留合法 JSON 的 `title` / `summary` 拆分逻辑。

## Out of Scope

- 不修改模型 prompt。
- 不清理生产环境已落库的历史脏摘要。

## Acceptance

- 当聚合模型返回 `{"title":"...","summary":"...文字"漂浮感"..."}` 这类因未转义引号导致的非法 JSON 时，重生成链路仍能提取标题和摘要正文。
- 聚合卡片摘要不展示 `{"title":...,"summary":...}` 外壳。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npx vitest run tests/integration/item-regeneration.test.ts` |
| Failure Signal | 线上样例中的 `summary` 包含未转义 `"漂浮感"`，`JSON.parse` 失败后整段结构化文本被当作摘要 |
| Determinism | deterministic |
| Re-run Plan | 用线上样例构造回归测试，确认存储摘要不包含 `{"title"` |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | 模拟管理员重新生成聚合摘要，`summarizeCluster` 返回含未转义内部引号的 cluster presentation JSON |
| Observed Failure | 旧解析只支持合法 JSON；解析失败后返回 `{ title: fallback.title, summary: normalized }` |
| Expected Behavior | 从模型输出中恢复 `title` 和 `summary`，至少不能把结构化 JSON 外壳展示给用户 |
| Root Cause | 聚合 prompt 已要求模型返回 `{title, summary}`，但 `parseClusterPresentationOutput` 对非法 JSON 没有字段级容错；summary 正文内未转义引号会触发 fallback-to-raw |
| Fix Hypothesis | 在合法 JSON 解析失败后，按 `summary` 字段边界恢复正文；若看起来是结构化输出但无法恢复，则使用 fallback，避免展示 JSON 外壳 |
| Regression Validation | `npx vitest run tests/integration/item-regeneration.test.ts` |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Files Likely Touched

- `src/lib/clusters/helpers.ts`
- `tests/integration/item-regeneration.test.ts`

## Execution

- 在 cluster presentation 解析层增加非法 JSON 容错。
- 为线上样例增加管理员聚合摘要重生成集成测试。
- 运行目标测试和 lint。

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/clusters/helpers.ts` | 增加 malformed cluster presentation 恢复解析，并避免结构化输出解析失败时回退为 raw summary |
| `tests/integration/item-regeneration.test.ts` | 增加未转义引号导致非法 JSON 的聚合摘要重生成回归测试 |
| `tasks/quick/cluster-summary-json-title.md` | 记录 Quick Lane fix 证据 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "生产环境存在聚合卡片摘要里有title json样式" --json` | pass | 路由为 Quick Lane、low risk、small scope、no contract impact |
| `npx @shawnxie666/forge-loop scaffold quick --slug cluster-summary-json-title --request "生产环境存在聚合卡片摘要里有title json样式"` | pass | 生成 quick task |
| `npx vitest run tests/integration/item-regeneration.test.ts` | pass | 1 file passed, 10 tests passed |
| `npm run lint` | pass | 0 errors；存在既有 warning：`src/components/admin/admin-page-client.tsx:133` `_props` 未使用 |

## Result

done

## Follow-ups

- 可单独做一次生产数据修复脚本或后台重新生成，清理已经落库的旧脏摘要。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否要批量修复线上已存在的脏摘要 | human | no | 本次只修新增/重生成链路 |

## Assumptions

- 这类输出仍遵循 `{title, summary}` 的字段顺序；合法 JSON 继续走 `JSON.parse`。

## Risks

- 对结构更复杂的非法 JSON，只做保守恢复；无法恢复时使用 fallback，避免再次展示 JSON 外壳。

## Validation

- Completion claim is based on the fresh command results in Commands Run.
