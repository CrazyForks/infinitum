---
forge_loop: true
artifact: review-report
slug: 聚合管理搜索优化与删除软候选逻辑
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: 聚合管理搜索优化与删除软候选逻辑

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: remove cluster_merge soft candidate channel; remove related timeline/UI metrics; optimize admin cluster search to title-only fuzzy matching; update tests and quick tasks |
| Review Depth | standard |
| Specialist Reviewers | data mutation, observability, and query performance lightweight pass |
| Adversarial Pass | not required for standard depth |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| Remove soft candidate logic | pass | Object-conflict pairs are hard rejected again and no budget-fill pass remains. |
| Preserve non-soft behavior | pass | Existing strict candidate scoring, dirty/hash skip, related pair limit, and hard cap 80 remain. |
| Keep detach fix | pass | No changes to detach singleton reassignment. |
| Remove soft metrics | pass | Merge result, ingestion timeline counters, and monitor summary no longer reference soft object metrics. |
| Optimize admin cluster search | pass | Search branch now matches only cluster title and child item titles through a CTE id selection before loading page details. |
| Exclude details from fuzzy search | pass | Tests lock that cluster summaries and child item details do not participate in admin cluster search. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API shape | pass | No route contract, schema, or dependency changes. |
| Serialized timeline | pass | Removed newly added soft metrics; existing core metrics remain unchanged. |
| Data mutation | pass | No new mutation path introduced. |
| Search semantics | pass | Behavior intentionally narrows search scope per product decision: title fields only. |

## Code Quality

- No Must Fix findings.
- The deletion is narrow and returns helper logic to the hard object-conflict path.
- Tests now lock in that strong text overlap does not bypass object conflict.
- The search SQL uses parameterized Prisma raw fragments and keeps the default no-search list path unchanged.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Checked stale references, object-conflict branch, UI summary, and timeline counters. |
| API / Data Breakage | pass | No schema/env/dependency changes. |
| Security | pass | No auth or external data transmission changes. |
| Performance | pass | Removes an extra candidate expansion pass and avoids Prisma correlated LIKE scans over large item fields in admin cluster search. |
| Deployability | pass | Typecheck and focused tests pass. |

## Test Coverage

- `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/components/task-monitor-panel.test.tsx tests/integration/cluster-assignment.test.ts` passed: 3 files, 19 tests.
- `npm test -- tests/integration/admin-cluster-api.test.ts` passed: 8 tests.
- `npx tsc --noEmit` passed.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- If recall still needs improvement later, design a more conservative rule with offline examples before enabling it in production.
- If detail/body search is needed later, implement it as a separate full-text search entry instead of overloading admin cluster list search.

## Final Recommendation

Approve. Current diff has no Must Fix, no Security High Risk, and no unexplained test failure.
