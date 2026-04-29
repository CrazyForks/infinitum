---
forge_loop: true
artifact: task-result
slug: daily-report-ai-refinement
task_id: T1
status: implemented
blocking: false
---

# Task Result T1: Persist Stable Source Registry Data

## Summary

Implemented report-local stable source registry persistence for AI daily reports.

## Changes

- Added nullable `DailyReportSource` snapshot fields: `sourceNumber`, `sourceKey`, `sourceSummary`, `sourcePublishedAt`, `sourceQualityScore`, and event signature fields.
- Added indexes on `(dailyReportId, sourceNumber)` and `(dailyReportId, sourceKey)`.
- Updated daily report generation to persist `sourceNumber` and source snapshots for every cited source occurrence.
- Added source registry building and validation helpers that group occurrence rows by `sourceNumber`.
- Added best-effort recovery for existing reports that lack `sourceNumber`, using same-day candidates by item, cluster, or URL, then backfilling recovered rows.

## Contract Compliance

Pass. `DailyReportContent.sourceIds` remains `number[]`, and `sourceNumber` is stable within one report.

## Spec Compliance Review

Pass. The implementation follows the approved stable source ID scheme and fails closed when a complete source registry cannot be built.

## Code Quality Review

Pass. Schema changes are additive, old report recovery is isolated in the daily report service, and public rendering paths remain compatible.

## Verification

- `npx tsc --noEmit` passed.
- `npm test -- tests/unit/ai-provider.test.ts tests/unit/daily-report.test.ts tests/integration/daily-report-service.test.ts tests/integration/daily-report-cache-version.test.ts` passed with 33 tests.

## Known Issues

N/A

## Risks

- Recovery for existing reports depends on same-day candidate matching. If old source rows cannot be matched, refinement returns `source_registry_unavailable`.
