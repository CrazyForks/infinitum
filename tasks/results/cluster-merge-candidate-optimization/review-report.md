---
forge_loop: true
artifact: review-report
slug: cluster-merge-candidate-optimization
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: cluster-merge-candidate-optimization

This nested report mirrors `tasks/results/review-report.md` for the H4 gate structure.

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve with Follow-ups |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: cluster merge candidate limiting, per-cluster merge hash reuse, merge observability, admin task detail modal width, tests, quick task records |
| Review Depth | deep |
| Specialist Reviewers | architecture and security checklist |
| Adversarial Pass | done |
| Retrospective | skipped: quick iteration with focused implementation and local validation |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| Reduce automatic cluster merge candidate volume | pass | Removed broad multi-item inclusion, added per-anchor related pair cap and total candidate cap. |
| Avoid repeatedly sending unchanged similar candidates | pass | `mergeInputHash` is checked per cluster, so clean pairs are skipped while changed clusters can still pull relevant neighbors. |
| Keep changed clusters prioritized | pass | Candidate sorting prefers dirty clusters before score, item count, and recency. |
| Improve merge pass observability | pass | Timeline now exposes base pool, pair filters, hash skips, dirty candidates, AI groups, moved items, and failed groups. |
| Make task detail modal wider | pass | Task detail modal width changed from `max-w-2xl` to `max-w-5xl`; confirm modal remains unchanged. |

## Design Compliance

| Area | Result | Notes |
| --- | --- | --- |
| Architecture | pass | Pair scoring and diagnostics stay in cluster helpers; merge orchestration stays in cluster service; timeline presentation remains in ingestion/admin layers. |
| Existing behavior preservation | pass | AI still makes final merge group decisions; merge target selection still sorts by `itemCount` within AI-returned groups. |
| Cost control | pass | Local filtering now bounds related pairs and total AI candidates before calling the merge prompt. |
| Operator visibility | pass | Added task timeline metrics make candidate pruning and hash skipping visible from admin task detail. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API | pass | No route path, auth, or public API response shape changed. |
| Types | pass | Internal result/counter types were extended consistently; `npx tsc --noEmit` passed. |
| Auth | N/A | No auth or permission code touched. |
| State | pass | Existing `contentCluster.mergeInputHash` is reused; no schema or migration required. |

## Code Quality

- No Must Fix findings.
- Candidate diagnostics are deterministic and covered by unit/component tests.
- Dirty-first ordering affects candidate input priority only; it does not change actual merge target selection.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Reviewed hash comparison, skip paths, AI failure paths, merge result counters, and modal width scope. |
| API / Data Breakage | pass | No schema, route, auth, or serialized external contract changes. |
| Deployability | pass | No migration or dependency change. |
| Observability | pass | Merge pass now records detailed pruning, dirty, AI, success, and failure counters. |
| Error Handling UX | pass | AI failure and no-provider paths still mark evaluated candidates and return skipped metrics. |
| Idempotency / Retry | pass | Per-cluster hash gating keeps repeated tasks from resending unchanged pairs, while changed clusters remain eligible. |
| Resource Cleanup | N/A | No resource lifecycle changes. |
| Dependency Change | N/A | No manifest or lockfile changes. |

## Autofix Routing

| Class | Count | Action |
| --- | --- | --- |
| safe_auto | 0 | N/A |
| gated_auto | 0 | N/A |
| manual | 0 | N/A |
| advisory | 1 | Monitor live metric distribution before further threshold tuning. |

## Workflow Metrics

| Signal | Value | Notes |
| --- | --- | --- |
| Route | quick | Work was handled through Quick Lane artifacts. |
| Gate Friction | low | H4 gate required nested reports; lightweight reports were added. |
| Verification Freshness | fresh | Targeted tests, integration test, typecheck, lint, workflow validation, and diff check were run this turn. |
| Rework Signal | low | Follow-up widened the task detail modal for the new summary density. |
| Template Noise | medium | Quick Lane plus H4 gate expects both quick artifacts and nested result reports. |

## Follow-ups

| Type | Item | Target | Notes |
| --- | --- | --- | --- |
| tuning | Watch real merge timeline values | runtime task timeline | Use live distribution to decide whether to tune score thresholds or candidate caps. |

## Security Review

- Pass. No auth, secrets, permission, user input execution, or new external network surface was added.

## Performance Review

- Pass with advisory. Pair scoring remains quadratic over recent active clusters, but AI candidate submission is now bounded by per-anchor and global caps.

## Test Coverage

- `npm test -- tests/unit/cluster-merge-candidates.test.ts` passed: 6 tests.
- `npm test -- tests/components/task-monitor-panel.test.tsx` passed: 4 tests.
- `npm test -- tests/integration/cluster-assignment.test.ts` passed: 5 tests.
- `npx tsc --noEmit` passed.
- `npm run lint` passed with 0 errors and one existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props`.
- `npx @shawnxie666/forge-loop validate` passed for all four quick task slugs.
- `git diff --check` passed.

## Should Fix

- N/A

## Nice To Have

- Consider a later compact UI layout for cluster merge timeline metrics if the single-line summary remains too dense on smaller desktop widths.

## Final Recommendation

Approve with Follow-ups. No Must Fix, security high-risk issue, or unexplained test failure was found.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- The existing 7-day merge lookback remains acceptable.
- Live task timeline metrics are sufficient for the next round of threshold tuning.

## Risks

- Merge candidate thresholds and caps may need tuning after observing live data.

## Validation

- No Must Fix before merge.
- No Security High Risk before merge.
- No unexplained test failure before merge.
- Review Depth classified and adversarial pass recorded.

## Must Fix
