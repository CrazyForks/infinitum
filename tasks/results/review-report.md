# Code Review Report

## Scope

- Review type: pre-commit review for current unstaged diff.
- Review depth: Deep, because the diff spans 10+ files and changes cluster merge decision semantics plus prompt config API validation.
- Files reviewed: cluster merge prompts, AI provider merge parsing, cluster merge candidate/input helpers, merge execution guard, settings seed backfill, prompt config routes, tests, and Quick Task docs.

## Must Fix

- None.

## Should Fix

- None.

## Nice To Have

- N/A.

## Checklist

| Area | Result | Notes |
| --- | --- | --- |
| Functional fit | pass | Cluster merge AI now confirms local candidate pairs instead of freely forming groups from a flat candidate pool. |
| Merge safety | pass | AI returned pairs must exist in local input pairs; execution also filters sources by allowed target edge. Explicit empty `approvedPairs` no longer falls back to legacy `mergeGroups`. |
| Multi-cluster behavior | pass | Approved pair graph is assembled conservatively: target is chosen by item count, and only target-direct approved edges become merge sources. |
| Prompt compatibility | pass | Legacy group-level output remains tolerated for old custom prompts, but service-side edge filtering still prevents execution outside local allowed pairs. |
| Default prompt backfill | pass | Existing untouched default `cluster_merge` prompts are upgraded by exact legacy matching; customized prompts are not overwritten. |
| API / contract | pass | Prompt config create/update schemas now derive from the shared prompt type constant and accept `cluster_merge`. |
| Data mutation safety | pass | Merge execution still uses existing `mergeClustersInternal`; no schema migration or new public write path. |
| Security / auth | pass | Admin prompt routes retain existing `requireAdmin` flow; no credential or permission changes. |
| Test coverage | pass | Added unit and integration coverage for pair input, approved-pair parsing, edge filtering, prompt backfill, and prompt config API enum acceptance. |
| Unrelated changes | pass | Diff contents are tied to the aggregation merge investigation and prompt config fix. |
| Deployability | pass | No dependency, schema, or migration change. Runtime backfill is seed-time and constrained to exact old defaults. |

## Verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | pass | Typecheck passed |
| `npm test -- tests/integration/admin-settings-api.test.ts tests/integration/admin-settings-service.test.ts tests/unit/ai-provider.test.ts tests/unit/cluster-merge-candidates.test.ts tests/integration/cluster-assignment.test.ts` | pass | 5 files, 58 tests passed |
| `npm run lint` | pass with warning | Existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props` |
| `git diff --check` | pass | No whitespace errors |
| `npx @shawnxie666/forge-loop validate --slug ...` | pass | Validated the 5 related Quick Task artifacts |

## Final Recommendation

Approve.
