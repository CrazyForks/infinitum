---
forge_loop: true
artifact: quick-task
slug: metrics-composite-score-distribution
status: done
mode: quick
blocking: false
---

# Quick Task: metrics-composite-score-distribution

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | N/A |
| Request | 将内容质量分布也改成统计综合分 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | monitor metric query change; no schema or API shape change |

## Scope

- Change monitor quality distribution from raw item AI score to composite feed score.
- Share the recommendation score formula between feed repository and monitor metrics.
- Add coverage proving the distribution counts composite feed-entry scores.

## Out of Scope

- No database migration or backfill.
- No API response shape change; `qualityScoreDistribution` buckets stay the same.
- No UI copy change in this pass.

## Acceptance

- Monitor quality distribution counts current displayable feed entries by composite recommendation score.
- Cluster cards count as one sample, single cards count as one sample.
- Disabled sources, hidden clusters, filtered items, and non-processed items are excluded like the feed.

| Field | Value |
| --- | --- |
| Loop Type | test |
| Command | `npm test -- tests/integration/ingestion-metrics-service.test.ts tests/integration/feed-api.test.ts tests/integration/admin-cluster-api.test.ts` |
| Failure Signal | high raw AI scores remain in 90-100 bucket instead of composite 80-89 bucket |
| Determinism | deterministic |
| Re-run Plan | rerun targeted metrics/feed integration tests after formula or query changes |

| Field | Value |
| --- | --- |
| Repro Steps | inspect `getQualityScoreDistribution()` in `src/lib/ingestion/metrics-service.ts` |
| Observed Failure | distribution grouped `Item.qualityScore` directly and ignored aggregation/vote composite score |
| Expected Behavior | distribution uses the same composite recommendation formula as feed score display |
| Root Cause | monitor metric query had a separate raw item score grouping path |
| Fix Hypothesis | extract feed score formula into shared `recommend-score` helper and use it in metrics SQL |
| Regression Validation | integration test creates cluster and single entries whose composite score buckets differ from raw AI score buckets |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | `src/lib/feed/recommend-score.ts` owns shared formula; `src/lib/feed/repository.ts` uses it for feed/admin cluster scores; `src/lib/ingestion/metrics-service.ts` uses it for distribution buckets |
| Architecture Candidates | Keep SQL and JS composite score formula in one helper module |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/feed/recommend-score.ts`
- `src/lib/feed/repository.ts`
- `src/lib/ingestion/metrics-service.ts`
- `tests/integration/ingestion-metrics-service.test.ts`

## Execution

- Extract composite score formula from feed repository into a shared helper.
- Rewrite monitor quality distribution SQL to produce feed-entry composite scores.
- Add integration coverage and run targeted regression checks.

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/feed/recommend-score.ts` | Added shared JS and SQL composite score helpers |
| `src/lib/feed/repository.ts` | Imports shared composite score helpers |
| `src/lib/ingestion/metrics-service.ts` | Builds quality distribution from composite feed-entry scores |
| `tests/integration/ingestion-metrics-service.test.ts` | Covers composite score distribution buckets |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "将内容质量分布也改成统计综合分" --json` | pass | Routed as Quick Lane, low risk |
| `npx @shawnxie666/forge-loop scaffold quick --slug metrics-composite-score-distribution --request "将内容质量分布也改成统计综合分"` | pass | Created quick task artifact |
| `npm test -- tests/integration/ingestion-metrics-service.test.ts tests/integration/feed-api.test.ts tests/integration/admin-cluster-api.test.ts` | pass | 26 tests passed |
| `npx tsc --noEmit` | pass | TypeScript validation passed |
| `npm run lint` | pass | 0 errors; 1 unrelated warning in `src/components/admin/admin-page-client.tsx` |
| Spec Compliance Review | pass | Distribution now uses composite feed-entry scores while preserving bucket API shape |
| Code Quality Review | pass | Shared score helper removes duplicated formula between feed and metrics SQL paths |

## Result

done

## Follow-ups

- Consider renaming the dashboard title from "内容质量分分布" to "综合分分布" if the product copy should reflect the new metric source.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- "综合分" means the same feed-entry composite recommendation score used for feed display and sorting.

## Risks

- Historical bucket counts will shift immediately because this is read-time calculation, not stored data migration.

## Validation

- Targeted integration tests, TypeScript check, and lint.
- Completion claim is based on the fresh command results in Commands Run.
