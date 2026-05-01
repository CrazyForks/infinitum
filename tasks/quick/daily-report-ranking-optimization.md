---
forge_loop: true
artifact: quick-task
slug: daily-report-ranking-optimization
status: done
mode: spike
blocking: false
---

# Quick Task: daily-report-ranking-optimization

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | spike |
| Spike Type | optimization |
| Request | 分析日报生成流程是否需要优化，评估 qualityScore 是否应替换为综合分排序 |
| Owner | human |
| Created | 2026-05-01 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- 分析日报候选排序和现有 feed 综合推荐分之间的差异。
- 判断是否建议把日报候选从裸 `qualityScore` 改为综合分。

## Out of Scope

- 本轮不实现代码变更。
- 不调整生产配置。

## Acceptance

- 明确当前 `qualityScore` 的含义。
- 明确是否建议使用综合分以及建议方案。

## Feedback Loop

| Field | Value |
| --- | --- |
| Loop Type | code trace |
| Command | `rg`, `nl`, `sed` |
| Failure Signal | N/A |
| Determinism | deterministic |
| Re-run Plan | 如进入实现，增加日报候选排序集成测试并对比候选顺序 |

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
| Current Daily Ranking | `listDailyReportCandidates` 当前按 `qualityScore desc, createdAt desc` 截取候选 |
| qualityScore Meaning | `qualityScore` 来自单条内容 AI 分析结果，失败或禁用 AI 分析时回退为 50；它不是 feed 使用的综合推荐分 |
| Existing Composite Score | `feed/recommend-score.ts` 已有 `recommendScore = AI base + aggregationBoost + feedbackBoost`，feed 的 `score_desc` 使用该综合分 |
| Cluster Signal | 聚合后的 cluster 本身维护 `score = max(item.qualityScore)`、`itemCount`、`latestPublishedAt`；综合分另行在 feed 查询中计算 |
| Optimization Candidate | 日报候选更适合使用综合分或分层策略，避免单条高 `qualityScore` 压过多来源重复验证的重大事件 |
| Caution | 不能直接照搬 feed 的用户投票权重；日报是编辑型输出，投票反馈可能较稀疏，也可能把历史偏好带进当天摘要 |

## Files Likely Touched

- `src/lib/daily-report/repository.ts`
- `src/lib/feed/recommend-score.ts`
- `tests/integration/daily-report-service.test.ts`

## Execution

- 读取日报候选查询、日报生成服务、item 分析写入、feed 综合分和 cluster 统计代码。
- 只产出优化建议，不改业务代码。

### Changed Files

| File | Change |
| --- | --- |
| `tasks/quick/daily-report-ranking-optimization.md` | 记录日报排序优化分析 |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route ... --json` | pass | Quick Lane spike |
| `rg -n "qualityScore\|recommendScore\|score_desc" ...` | pass | 定位日报候选和 feed 综合分 |
| `nl -ba src/lib/daily-report/repository.ts ...` | pass | 确认日报按 `qualityScore desc, createdAt desc` 排序 |
| `nl -ba src/lib/feed/recommend-score.ts ...` | pass | 确认综合分算法 |

## Result

done

## Follow-ups

- 推荐实现日报候选综合排序，优先复用 `buildRecommendScoreSql` 的思想，但弱化或先不使用投票反馈。
- 建议先做 SQL/测试层最小改动，再根据生成效果决定是否引入更多多样性约束。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| 日报是否应该强制 topic/source 多样性，而不是只优化分数？ | human | no | 建议作为第二阶段 |

## Assumptions

- 日报目标是覆盖当天重要 AI 事件，而不是简单复刻 feed 排行榜。

## Risks

- 仅换成综合分可能仍无法解决同质候选挤占上下文的问题。
- 如果引入投票反馈，可能让用户偏好过度影响客观日报覆盖。

## Validation

- 结论基于本轮代码阅读；未运行业务测试，因为本轮未改代码。
- Completion claim is based on the fresh command results in Commands Run.
