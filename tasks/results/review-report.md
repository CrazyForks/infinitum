---
forge_loop: true
artifact: review-report
slug: cluster-merge-soft-candidate-budget
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: cluster-merge-soft-candidate-budget

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: cluster_merge soft candidate recall, detach singleton assignment, ingestion timeline diagnostics, task monitor summary, quick task records |
| Review Depth | standard |
| Specialist Reviewers | data mutation and observability lightweight pass |
| Adversarial Pass | not required for standard depth |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| Budgeted soft candidate channel | pass | Strict candidates are selected first; soft object-conflict pairs only fill toward target 50, while hard limit 80 remains in force. |
| Preserve object-conflict guardrails | pass | Date conflicts remain hard rejects; object conflict only softens when subject/text anchors are strong and distinctive overlap count is at least 2. |
| Avoid permanent orphan after detach | pass | Detached items are reassigned into a singleton cluster with normal aggregation disabled for that operation. |
| Timeline observability | pass | Backend timeline records soft object pair/selected/hash-skipped counters. |
| Monitoring readability | pass | The cluster_merge UI summary compresses soft-object diagnostics into `软对象 selected/total`. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API shape | pass | No public route contract or schema migration changed. |
| Serialized timeline | pass | Added metrics are additive label/value entries; older timeline consumers continue to parse unknown metrics generically. |
| Data mutation | pass | Detach still returns previous cluster id and invalidates feed cache; new singleton recompute keeps item visible for later merge passes. |
| Limits | pass | `CLUSTER_MERGE_TARGET_CANDIDATE_COUNT=50` is a fill target, not a replacement for the 80 hard cap. |

## Code Quality

- No Must Fix findings.
- Candidate expansion is isolated in `buildClusterMergeCandidateSelection` and keeps clean-pair hash skipping.
- The UI summary avoids exposing every diagnostic counter while still surfacing whether soft recall contributed.
- Quick task artifacts are marked done and production spike records are included as evidence for the rule change.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Checked soft-pair gating, target cap, date conflict preservation, detach singleton reassignment, and summary fallback when soft metrics are zero. |
| API / Data Breakage | pass | No schema, env, or route changes. |
| Security | pass | No new auth surface; production investigation remained read-only. |
| Performance | pass | Soft expansion only runs after strict candidate selection and remains bounded by target/hard candidate limits. |
| Deployability | pass | Docker compose rebuild succeeded; no migration required. |
| Error Handling UX | pass | Existing cluster merge AI failure/hash skip flows are preserved. |
| Idempotency / Retry | pass | MergeInputHash handling remains per candidate; detached singleton can participate in future passes without immediate normal rejoin. |
| Dependency Change | N/A | manifest and lockfile unchanged. |

## Test Coverage

- `npm test -- tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts tests/components/task-monitor-panel.test.tsx` passed: 3 files, 20 tests.
- `npx tsc --noEmit` passed.
- `npm run lint` exited 0 with one pre-existing warning: `src/components/admin/admin-page-client.tsx:133` `_props` unused.
- `npx @shawnxie666/forge-loop validate --slug cluster-merge-soft-candidate-budget` passed.
- `npx @shawnxie666/forge-loop validate --slug deepseek-cluster-prod-spike` passed.
- `npx @shawnxie666/forge-loop validate --slug openai-stargate-compute-prod-spike` passed.
- `docker compose up -d --build` passed and restarted local app/worker.
- `git diff --check` passed.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- After deployment, compare `软对象入选`, `候选组`, and downstream AI merge results for a few ingestion runs to tune the target or soft-anchor threshold if recall/noise balance drifts.

## Final Recommendation

Approve. Current diff has no Must Fix, no Security High Risk, and no unexplained test failure. It is ready to commit.
