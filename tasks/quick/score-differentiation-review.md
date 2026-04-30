---
forge_loop: true
artifact: quick-task
slug: score-differentiation-review
status: done
mode: quick
blocking: false
---

# Quick Task: score-differentiation-review

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | optimization |
| Request | 现在综合评分中AI评分占比是不是有点高？叠加聚合和用户反馈很容易就达成100了，这样很难体现差异性了 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | low |
| Escalation | none |
| Upgrade Summary | no contract, schema, API, or migration impact; scoring formula adjustment only |

## Scope

- Analyze the feed comprehensive recommendation score formula and identify why high scores saturate at 100.
- Adjust the comprehensive recommendation score so AI remains the primary ranking signal without mapping 1:1 into the final score.
- Preserve feed ordering semantics while restoring score differentiation near the top end.

## Out of Scope

- No prompt, schema, or migration change.
- No API response shape change; `score` remains the displayed comprehensive score.

## Acceptance

- Locate the current comprehensive score formula and its callers.
- Replace the additive 1:1 AI formula with an AI anchor, capped aggregation boost, and confidence-scaled feedback boost.
- Update affected feed test expectations and validate related cluster paths.

| Field | Value |
| --- | --- |
| Loop Type | trace |
| Command | `rg -n "qualityScore|upvotes|downvotes|recommendScore|calculateRecommendScore" src/lib src/app tests` |
| Failure Signal | high recommendation scores saturate at 100 in common scenarios |
| Determinism | deterministic |
| Re-run Plan | rerun feed API tests after any formula change |

| Field | Value |
| --- | --- |
| Repro Steps | inspect `src/lib/feed/repository.ts` and simulate representative AI / aggregation / vote inputs |
| Observed Failure | AI93 with 3 sources and 3 items reaches 100 without votes; AI88 with 3 sources, 8 items, and 5 net upvotes reaches 100; AI82 with 3 sources, 4 items, and 10 net upvotes reaches 100 |
| Expected Behavior | strong aggregation and feedback should improve ranking, but not collapse many entries into the same displayed score |
| Root Cause | `recommendScore` is additive: `aiScore + voteBoost + sourceBoost + itemBoost`, then hard-clamped to 100 |
| Fix Hypothesis | use `50 + (aiScore - 50) * 0.82`, cap aggregation at 10, and cap confidence-scaled feedback at +/-8 |
| Regression Validation | `npm test -- tests/integration/feed-api.test.ts` after formula changes |
| Failed Hypotheses | 0 |
| Handoff | N/A |

| Area | Finding |
| --- | --- |
| Module Map | `src/lib/feed/repository.ts` computes SQL and in-memory recommend scores; feed DTO maps `recommendScore` into public `score`; integration tests assert current cap behavior |
| Architecture Candidates | Prefer a shared formula helper or constants to keep SQL and JS paths aligned if changing the formula |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- `src/lib/feed/repository.ts`
- `tests/integration/feed-api.test.ts`

## Execution

- Trace current scoring formula and feed DTO mapping.
- Implement the headroom-preserving scoring formula in both JS and SQL paths.
- Update affected expectations and run focused verification.

### Changed Files

| File | Change |
| --- | --- |
| `src/lib/feed/repository.ts` | Changed comprehensive score formula in both JS and SQL paths |
| `tests/integration/feed-api.test.ts` | Updated expected scores to reflect the new headroom-preserving formula |
| `tasks/quick/score-differentiation-review.md` | Recorded scoring analysis, implementation, and validation |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npx @shawnxie666/forge-loop route "现在综合评分中AI评分占比是不是有点高？叠加聚合和用户反馈很容易就达成100了，这样很难体现差异性了" --json` | pass | Routed as Quick Lane, low risk, small scope |
| `npx @shawnxie666/forge-loop scaffold quick --slug score-differentiation-review --request "现在综合评分中AI评分占比是不是有点高？叠加聚合和用户反馈很容易就达成100了，这样很难体现差异性了"` | pass | Created quick task artifact |
| `rg -n "qualityScore|upvotes|downvotes|visitor_cluster_votes|cluster.*score|score.*cluster|calculate.*score|compute.*score|score =|score:|score\\)" src/lib src/app tests --glob '!**/.next/**' --glob '!**/node_modules/**'` | pass | Found feed scoring implementation and related tests |
| `node - <<'NODE' ... score simulation ... NODE` | pass | Confirmed common scenarios saturate at 100 |
| `npm test -- tests/integration/feed-api.test.ts tests/integration/feed-cluster-vote-api.test.ts` | pass | 25 tests passed after updating feed score expectations |
| `npm run lint` | pass | 0 errors; 1 unrelated warning in `src/components/admin/admin-page-client.tsx` |
| `npx tsc --noEmit` | pass | TypeScript validation passed |
| `git diff --check` | pass | No whitespace errors |
| `npm test -- tests/integration/admin-cluster-api.test.ts tests/integration/cluster-assignment.test.ts` | pass | 10 tests passed for admin cluster and cluster assignment paths |

## Result

done

## Follow-ups

- Consider exposing raw AI `qualityScore` separately in the future if the UI needs to explain why displayed score differs from AI quality.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| Should the displayed `score` remain a comprehensive score, or should API expose both `qualityScore` and `recommendScore`? | human | no | left as future product decision |

## Assumptions

- The user's concern is about the public feed/admin displayed score and score sorting, not the raw AI `qualityScore` stored on items.
- The existing public `score` field should remain backward-compatible as a single comprehensive score.

## Risks

- Formula changes can reorder score-sorted feed results; related feed and cluster tests were run to catch unintended changes.

## Validation

- Static trace, deterministic score simulation, focused integration tests, lint, typecheck, and diff whitespace check.
- Completion claim is based on the fresh command results in Commands Run.
