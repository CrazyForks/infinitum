---
forge_loop: true
artifact: review-report
slug: ai-cluster-title-presentation
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: ai-cluster-title-presentation

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve with Follow-ups |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: cluster prompt, cluster presentation parsing, settings seed upgrade, related tests and quick task |
| Review Depth | standard |
| Specialist Reviewers | architecture |
| Adversarial Pass | N/A |
| Retrospective | skipped: low-risk quick iteration |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| AI generates better multi-item cluster titles | pass | Default cluster summary prompt now asks for `{title, summary}` and `generateClusterPresentation()` writes parsed AI title as display title for multi-item clusters. |
| Preserve cluster matching semantics | pass | AI title affects `ContentCluster.title` display only; fingerprint and event signature logic remain based on item event fields. |
| Existing prompt configs are upgraded only when untouched legacy defaults | pass | Seed logic matches the old default cluster summary prompt and sampling values exactly before updating. Customized prompts are preserved. |
| No schema migration required | pass | Prisma schema is unchanged; existing `PromptConfig` and `ContentCluster` fields are reused. |

## Design Compliance

| Area | Result | Notes |
| --- | --- | --- |
| Architecture | pass | Reuses the existing `cluster_summary` AI call instead of adding a second model call or schema field. |
| Backward compatibility | pass | Plain text cluster summary output is still accepted and falls back to the old summary-only behavior. |
| Cache / recompute behavior | pass | `summaryInputHash` no longer includes final display title, preventing AI title updates from forcing an extra automatic recompute. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API | N/A | No route or external API response contract change. |
| Types | pass | Public `AiProvider.summarizeCluster()` remains `Promise<string>`; structured parsing stays internal to cluster helpers. |
| Auth | N/A | No auth path touched. |
| State | pass | Runtime seed upgrade mutates only untouched legacy default `cluster_summary` prompt rows. |

## Code Quality

- No Must Fix findings.
- Legacy prompt matching is intentionally strict to avoid overwriting user-customized prompt configs.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Fallback paths cover empty output, non-JSON plain summaries, AI failure, single-item clusters, and Chinese retry path. |
| API / Data Breakage | pass | No DB schema change; prompt data upgrade is guarded by exact legacy default matching. |
| Deployability | pass | Existing databases can run new code without migration; untouched old default prompt rows are upgraded at runtime seeding. |
| Observability | N/A | No logging or metrics change. |
| Error Handling UX | pass | AI parse failure degrades to plain summary/fallback behavior rather than throwing. |
| Idempotency / Retry | pass | `ensureRuntimeConfigSeeded()` can run repeatedly; after the guarded update, the legacy match no longer applies. |
| Resource Cleanup | N/A | No resource lifecycle touched. |
| Dependency Change | N/A | No manifest or lockfile change. |

## Autofix Routing

| Class | Count | Action |
| --- | --- | --- |
| safe_auto | 0 | N/A |
| gated_auto | 0 | N/A |
| manual | 0 | N/A |
| advisory | 2 | noted |

## Workflow Metrics

| Signal | Value | Notes |
| --- | --- | --- |
| Route | quick | Matched small scoped implementation and data-upgrade guard. |
| Gate Friction | low | Review required before commit by project rules. |
| Verification Freshness | fresh | Targeted tests and lint were run in this work. |
| Rework Signal | low | Follow-up added safe legacy prompt upgrade after initial implementation. |
| Template Noise | low | Review report is heavier than diff but required before commit. |

## Follow-ups

| Type | Item | Target | Notes |
| --- | --- | --- | --- |
| test | Fix existing full-repo typecheck blocker | `tests/integration/item-cleanup.test.ts` | `npx tsc --noEmit` still fails on an unrelated `ItemStatus` type error. |
| test | Fix existing full `admin-settings-service` source assertions | `tests/integration/admin-settings-service.test.ts` | Full file still has 2 unrelated source seeding/latest item failures. |

## Security Review

- N/A. No auth, secrets, external input execution, or permission path changed.

## Performance Review

- Pass. The title generation uses the existing cluster summary call; no new AI call or dependency was added. Runtime seed upgrade adds a small prompt-config count/update check.

## Test Coverage

- `npm test -- tests/unit/config.test.ts tests/unit/ai-provider.test.ts tests/integration/ingestion-service.test.ts tests/integration/item-regeneration.test.ts` passed: 52 tests.
- `npm test -- tests/integration/admin-settings-service.test.ts -t "upgrades the untouched legacy default cluster summary prompt|does not overwrite a customized cluster summary prompt|seeds code defaults"` passed: 3 selected tests.
- `npm run lint` passed with 0 errors and 3 unrelated existing warnings.
- `npx tsc --noEmit` remains blocked by an unrelated existing `tests/integration/item-cleanup.test.ts` type error.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- Consider surfacing a one-time admin notice if customized cluster summary prompts still return plain summaries and therefore do not generate AI titles.

## Final Recommendation

Approve with Follow-ups. The change is scoped, backward compatible, and has targeted tests for the new structured title behavior and guarded legacy prompt upgrade. No Must Fix or security high-risk issue found.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- AI-generated cluster titles are display metadata and should not become matching or fingerprint inputs.
- Strict legacy prompt matching is preferred over broader heuristics to avoid overwriting user customization.

## Risks

- Customized legacy prompts will not automatically start producing AI titles; this is intentional to preserve admin edits.
- Existing unrelated typecheck/test failures remain outside this change.

## Validation

- No Must Fix before merge.
- No Security High Risk before merge.
- No unexplained test failure before merge.
- Review Depth classified and specialist/adversarial passes recorded when required.
