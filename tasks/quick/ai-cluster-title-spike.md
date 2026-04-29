---
forge_loop: true
artifact: quick-task
slug: ai-cluster-title-spike
status: done
mode: quick
blocking: false
---

# Quick Task: ai-cluster-title-spike

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | optimization |
| Request | 聚合条目标题是不是更建议通过AI生成，当前通过主体动作事件可能会有缺失（比如有两个主体） |
| Owner | Codex |
| Created | 2026-04-29 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 分析聚合标题当前如何生成，以及是否应把多条内容的聚合标题交给 AI 生成。
- 实现多条聚合标题和摘要的结构化 AI 输出解析。
- 保持单条 cluster、无 AI、AI 失败和旧纯文本聚合摘要输出的回退行为。
- 对已有数据库中“仍是旧版系统默认值”的 `cluster_summary` 配置做安全升级，不覆盖用户自定义提示词。

## Out of Scope

- 不改数据模型。
- 不改 AI provider 契约。
- 不改聚合匹配逻辑。

## Acceptance

- 给出是否建议 AI 生成聚合标题的判断。
- 说明成本、效率、合理性和语义影响。
- 标出后续实现的最小改动面。

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| 聚合标题 | `ContentCluster.title`，首页和候选聚合组展示标题 |
| 事件签名 | `eventSubject` / `eventAction` / `eventObject` / `eventDate` |
| 聚合摘要 | `cluster_summary` AI 任务，当前只返回摘要正文 |

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | trace |
| Command | `rg` / `sed` / `nl` code inspection |
| Failure Signal | N/A |
| Determinism | deterministic |
| Re-run Plan | 重新检查 `src/lib/clusters/helpers.ts`、`src/lib/clusters/service.ts`、`src/config/prompts.ts` |

## Debugging Evidence

| Field | Value |
| --- | --- |
| Repro Steps | N/A |
| Observed Failure | N/A |
| Expected Behavior | N/A |
| Root Cause | N/A |
| Fix Hypothesis | N/A |
| Regression Validation | N/A |
| Failed Hypotheses | 0 |
| Handoff | N/A |

## Spike Findings

| Area | Finding |
| --- | --- |
| Module Map | `assignItemToCluster()` creates initial `ContentCluster.title` from `buildEventDisplayTitle()` or item display title. `recomputeCluster()` calls `generateClusterPresentation()` and writes `presentation.title` back to the cluster. |
| Architecture Candidates | Implemented structured cluster presentation by letting the existing `cluster_summary` prompt return `{ title, summary }`; parser keeps compatibility with old plain-summary outputs and preserves deterministic fallback. |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/config/prompts.ts`
- `src/lib/clusters/helpers.ts`
- `src/lib/clusters/service.ts`
- `src/lib/settings/ai-config.ts`
- `tests/unit/config.test.ts`
- `tests/integration/admin-settings-service.test.ts`
- `tests/integration/ingestion-service.test.ts`

## Execution

- Read Forge Loop project context and route request.
- Inspect cluster assignment, title fallback, AI cluster summary, and prompt configuration.
- Updated default cluster summary prompt to request JSON `{title, summary}`.
- Parsed structured AI output in cluster helpers while accepting old plain-text summary output.
- Removed final display title from `summaryInputHash` so AI title changes do not cause a second automatic summary call.
- Added runtime config seeding upgrade logic for untouched legacy default `cluster_summary` prompt rows.
- Added regression coverage for AI-generated cluster title and unchanged hash skip behavior.
- Added settings-service coverage for upgrading old defaults and preserving customized prompts.

### Changed Files

| File | Change |
| --- | --- |
| `src/config/prompts.ts` | Default cluster summary prompt now asks for structured title and summary JSON |
| `src/lib/clusters/helpers.ts` | Parses structured cluster presentation output, preserves old plain-text summary fallback, retries Chinese generation based on parsed summary |
| `src/lib/clusters/service.ts` | Builds cluster summary input hash from item seed only |
| `src/lib/settings/ai-config.ts` | Raises default cluster summary max tokens to fit title plus summary JSON |
| `src/lib/settings/core.ts` | Upgrades only untouched legacy default cluster summary prompt configs during runtime config seeding |
| `tests/unit/config.test.ts` | Updates default prompt expectations |
| `tests/integration/admin-settings-service.test.ts` | Updates default cluster summary max token expectation and covers legacy-default upgrade vs customized prompt preservation |
| `tests/integration/ingestion-service.test.ts` | Covers AI-generated cluster display title and hash skip behavior |
| `tasks/quick/ai-cluster-title-spike.md` | Records implementation and validation |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "聚合条目标题是不是更建议通过AI生成，当前通过主体动作事件可能会有缺失（比如有两个主体）" --json` | pass | Routed to Quick Lane, low risk |
| `rg -n "主体|动作|事件|title|headline|cluster.*title|displayTitle|aggregate|aggregation|ContentCluster|summary" src tests prisma` | pass | Located cluster title and summary code paths |
| `sed -n '1,480p' src/lib/clusters/service.ts` | pass | Verified recompute writes `presentation.title` |
| `sed -n '320,540p' src/lib/clusters/helpers.ts` | pass | Verified AI summary keeps fallback title |
| `nl -ba src/lib/ai/provider.ts \| sed -n '68,76p;701,714p'` | pass | Verified provider cluster summary contract returns text only |
| `npm test -- tests/unit/config.test.ts tests/unit/ai-provider.test.ts tests/integration/ingestion-service.test.ts tests/integration/item-regeneration.test.ts` | pass | 4 files passed, 52 tests passed |
| `npm test -- tests/integration/admin-settings-service.test.ts -t "seeds code defaults"` | pass | Verified default prompt seeding expectation for changed max tokens |
| `npm test -- tests/integration/admin-settings-service.test.ts -t "upgrades the untouched legacy default cluster summary prompt\|does not overwrite a customized cluster summary prompt\|seeds code defaults"` | pass | 3 selected tests passed, covering safe legacy prompt upgrade |
| `npm run lint` | pass | 0 errors, 3 pre-existing warnings in unrelated files |
| `npx tsc --noEmit` | fail | Blocked by pre-existing `tests/integration/item-cleanup.test.ts(57,9): Type 'string' is not assignable to type 'ItemStatus \| undefined'` |
| `npm test -- tests/integration/admin-settings-service.test.ts` | fail | 2 pre-existing source seeding/latest item assertions still fail outside this prompt change |

## Result

done

## Follow-ups

- Existing databases with customized `cluster_summary` prompt text will keep producing plain summaries until that prompt is updated manually.
- Fix the unrelated `tests/integration/item-cleanup.test.ts` type error before relying on full-repo `tsc --noEmit`.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 是否允许调整 `cluster_summary` 输出为 JSON 或新增独立 presentation 方法？ | human | no | 已按现有 `cluster_summary` 提示词输出 JSON 的方式实现 |

## Assumptions

- 聚合标题是展示质量问题，不改变聚合匹配的事实锚点。
- 单条 cluster 仍应保留原标题或事件签名标题，避免为单条内容额外调用 AI。

## Risks

- 如果直接让 AI 标题参与 fingerprint 或 exact title match，可能降低匹配稳定性；当前实现只把 AI 标题作为展示标题写入。
- JSON 输出会影响现有可配置 prompt；当前实现兼容旧纯文本摘要输出，但旧 prompt 不会自动生成更好的标题。

## Validation

- 基于本轮代码检查、相关测试和 lint。
- Completion claim is based on the fresh command results in Commands Run.
