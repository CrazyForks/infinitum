---
forge_loop: true
artifact: review-report
slug: cluster-search-and-homepage-batch-merge
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: cluster-search-and-homepage-batch-merge

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: admin cluster Chinese search recall, singleton display title, homepage batch merge, tests, quick task records |
| Review Depth | deep |
| Specialist Reviewers | security lightweight, data mutation/adversarial pass |
| Adversarial Pass | completed |
| Retrospective | skipped: focused quick iterations |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| 中文模糊搜索召回 | pass | Added shared search normalization and database-search terms, with tests for CJK compact/subsequence cases. |
| 手动加入聚合组搜索 | pass | Picker now uses backend search, debounce, larger page size, no default itemCount restriction, and singleton original item title display. |
| 聚合管理关键词筛选 | pass | Admin list search uses backend filtering with debounce; default list keeps `minItemCount=2` through explicit frontend parameter. |
| 聚合详情合并搜索 | pass | Merge modal uses independent backend candidate search and displays singleton original title. |
| 首页批量合并 | pass | Batch toolbar supports selected item merge; backend chooses the selected item cluster with largest `itemCount` as target. |

## Design Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API shape | pass | `minItemCount` is generic and defaults to no restriction; avoids bespoke `includeSingletons`. |
| Pagination | pass | Admin cluster search still applies Prisma `where`, `count`, `take`, and `skip`; no app-layer pagination. |
| Batch merge semantics | pass | Operation is item-id based and does not implicitly move unselected sibling items. |
| Display logic | pass | Singleton display title logic centralized in `getClusterDisplayTitle`. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| Auth | pass | New merge-items API requires `requireAdmin`. |
| Data mutation | pass | Merge service validates processed/displayable items and active clusters before moving items. |
| Types | pass | DTO adds optional `originalTitle`; existing callers remain compatible. |
| Schema | pass | No database schema or dependency changes. |

## Code Quality

- No Must Fix findings.
- Search and display behavior is extracted to helpers instead of repeating ad hoc logic across components.
- Batch merge service keeps the existing recompute/invalidate path and mirrors manual cluster movement semantics.
- Untracked unrelated quick task files were identified and left unstaged.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Checked empty selections, same-cluster selections, missing items, inactive clusters, singleton display fallback. |
| API / Data Breakage | pass | New optional query param; existing default route remains valid. |
| Security | pass | Admin-only mutations and existing admin cluster listing auth remain intact. |
| Performance | pass | Search stays database-paginated; picker/merge candidates use bounded page sizes and debounce. |
| Deployability | pass | No migrations, env, dependency, or build pipeline changes. |
| Error Handling UX | pass | Batch merge reports backend error or generic failure; dialogs can be cancelled. |
| Idempotency / Retry | pass | Repeating a merge on already co-located items returns a controlled error rather than silently mutating. |
| Resource Cleanup | pass | Search effects clear timers and cancellation flags. |
| Dependency Change | N/A | manifest and lockfile unchanged. |

## Autofix Routing

| Class | Count | Action |
| --- | --- | --- |
| safe_auto | 2 | Replaced bespoke singleton flag with `minItemCount`; added singleton original title display helper. |
| gated_auto | 0 | N/A |
| manual | 0 | N/A |
| advisory | 1 | Full `npm test` was not run; targeted validation covers changed surfaces. |

## Workflow Metrics

| Signal | Value | Notes |
| --- | --- | --- |
| Route | quick | CLI route recommended Quick Lane, low risk. |
| Gate Friction | low | No human gate blockers after implementation. |
| Verification Freshness | fresh | Commands listed below were run in this turn. |
| Rework Signal | medium | Search API semantics refined from app-layer pagination to database pagination and generic `minItemCount`. |
| Template Noise | low | Quick task records kept concise. |

## Follow-ups

| Type | Item | Target | Notes |
| --- | --- | --- | --- |
| performance | Consider indexed search key if cluster count grows | future | Current Prisma `contains` + CJK terms is adequate for current bounded admin use. |

## Security Review

- Pass. New mutation route requires admin auth. No user-controlled SQL is introduced; Prisma query builders are used.

## Performance Review

- Pass. Search requests are debounced at 500ms and database-paginated. Merge picker and manual picker are bounded to 100 and 50 rows respectively.

## Test Coverage

- `npx tsc --noEmit` passed.
- `npx vitest run tests/integration/cluster-assignment.test.ts tests/components/feed-panel.test.tsx` passed: 2 files, 55 tests.
- `npx vitest run tests/integration/admin-cluster-api.test.ts tests/components/content-review-panel.test.tsx tests/unit/search.test.ts` passed: 3 files, 24 tests.
- `npx vitest run tests/components/feed-panel.test.tsx tests/components/content-review-merge-modal.test.tsx tests/components/content-review-panel.test.tsx tests/integration/admin-cluster-api.test.ts tests/unit/search.test.ts` passed: 5 files, 74 tests.
- Relevant local ESLint commands passed for changed surfaces.
- `git diff --check` passed.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- Future indexed or precomputed search key if admin cluster volume grows enough that multi-term `contains` becomes slow.

## Final Recommendation

Approve. Current diff has no Must Fix, no Security High Risk, and no unexplained test failure. It is ready to commit.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- Homepage batch merge should move only explicitly selected items, not all items from selected items' source clusters.
- Default admin cluster management list should remain multi-item by passing `minItemCount=2` from the frontend.

## Risks

- Batch merge recomputes affected clusters synchronously and may take longer if many clusters are selected at once.

## Validation

- No Must Fix before commit.
- No Security High Risk before commit.
- No unexplained test failure before commit.
- Review Depth classified and specialist checks recorded.
