---
forge_loop: true
artifact: review-report
slug: singleton-event-merge-spike
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: singleton-event-merge-spike

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve with Follow-ups |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: cluster merge candidate selection, singleton pair scoring, merge tests, quick task record |
| Review Depth | deep |
| Specialist Reviewers | architecture and security checklist |
| Adversarial Pass | done |
| Retrospective | skipped: quick iteration with narrow backend scope |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| Keep `itemCount >= 2` clusters in merge candidates | pass | `buildClusterMergeCandidates()` seeds selected IDs with all clusters whose `itemCount >= 2`. |
| Add singleton merge detection | pass | Singleton clusters can enter AI merge review when pair score passes local thresholds. |
| Do not hard-gate on `eventSubject` | pass | Subject similarity contributes score only; object/date/text anchors determine eligibility. |
| Avoid obvious false merges | pass | Date conflict and key object conflict reject pairs before AI. |
| Prefer larger target clusters | pass | Existing AI group execution still sorts by `itemCount` descending before choosing merge target. |

## Design Compliance

| Area | Result | Notes |
| --- | --- | --- |
| Architecture | pass | Candidate scoring is isolated in cluster helpers; service keeps orchestration responsibilities. |
| Existing behavior preservation | pass | Multi-item clusters continue to be sent to AI; singleton handling is additive. |
| Cost control | pass | Singleton clusters are narrowed locally before AI; score constants are centralized. |
| Prompt stability | pass | No AI prompt text was changed; only candidate selection and hash inputs changed. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API | pass | No route or response shape changes. |
| Types | pass | Helper types are extended internally; `npx tsc --noEmit` passes. |
| Auth | N/A | No auth or permission path touched. |
| State | pass | Merge execution still uses existing cluster merge path; `mergeInputHash` now includes semantic candidate fields. |

## Code Quality

- No Must Fix findings.
- Pair scoring is deterministic and configurable through constants.
- The `item-cleanup` test type cleanup is related to making full typecheck pass and does not affect runtime cleanup behavior.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Tests cover multi-item direct inclusion, multi-subject singleton inclusion, and conflicting object rejection. |
| API / Data Breakage | pass | No schema, route, auth, or public response contract changes. |
| Deployability | pass | Existing clusters may be re-evaluated once due to richer merge hash; this is expected after candidate logic changes. |
| Observability | advisory | Existing `executeClusterMerge()` result counts still expose `candidates`, `mergedCount`, and affected IDs; no new metrics added. |
| Error Handling UX | pass | AI failure path still updates hash and skips merge as before. |
| Idempotency / Retry | pass | Merge pass remains hash-gated; richer hash prevents stale semantic skips. |
| Resource Cleanup | N/A | No resource lifecycle touched. |
| Dependency Change | N/A | No manifest or lockfile change. |

## Autofix Routing

| Class | Count | Action |
| --- | --- | --- |
| safe_auto | 0 | N/A |
| gated_auto | 0 | N/A |
| manual | 0 | N/A |
| advisory | 1 | monitor thresholds after deploy |

## Workflow Metrics

| Signal | Value | Notes |
| --- | --- | --- |
| Route | quick | Started as spike, then implemented after user approval. |
| Gate Friction | low | Additional clarification changed multi-item behavior before commit. |
| Verification Freshness | fresh | Typecheck, lint, targeted unit/integration tests, diff check, and Forge validation were run. |
| Rework Signal | low | Follow-up adjusted direct inclusion for `itemCount >= 2`. |
| Template Noise | low | Review report required for pre-commit by project rules. |

## Follow-ups

| Type | Item | Target | Notes |
| --- | --- | --- | --- |
| tuning | Monitor merge candidate volume and false merge samples | runtime metrics/log review | If candidate volume or false positives rise, raise `CLUSTER_MERGE_AI_PAIR_MIN_SCORE` from 70 to 80 or add stricter object rejects. |

## Security Review

- Pass. No auth, secrets, permission, user input execution, or external network surface was added.

## Performance Review

- Pass with advisory. The pair scoring is quadratic over recent merge candidates, but the window is bounded to recent active clusters and replaces broad singleton AI submission with local filtering.

## Test Coverage

- `npx tsc --noEmit` passed.
- `npm run lint` passed with one existing warning: `src/components/admin/admin-page-client.tsx:130` has unused `_props`.
- `npm test -- tests/unit/cluster-merge-candidates.test.ts` passed: 3 tests.
- `npm test -- tests/integration/cluster-assignment.test.ts` passed: 5 tests.
- `npm test -- tests/integration/item-cleanup.test.ts` passed: 9 tests.
- `git diff --check` passed.
- `npx @shawnxie666/forge-loop validate --slug singleton-event-merge-spike` passed.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- Consider adding lightweight logging for raw recent cluster count vs selected AI candidate count if tuning becomes difficult.

## Final Recommendation

Approve with Follow-ups. The change preserves existing multi-item merge coverage, adds singleton merge recovery with conservative local guards, and has targeted tests for the key positive and negative cases. No Must Fix or security high-risk issue found.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- Existing 7-day merge window remains acceptable.
- AI remains the final authority for actual merge groups after local candidate selection.

## Risks

- Pair score thresholds are first-pass values and may need tuning against live samples.
- Richer merge hash can cause one-time re-evaluation of existing clusters after deploy.

## Validation

- No Must Fix before merge.
- No Security High Risk before merge.
- No unexplained test failure before merge.
- Review Depth classified and adversarial pass recorded.
