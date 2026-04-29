# Database

Status: draft

本文件用于沉淀长期数据库知识。每次迭代如果涉及数据库变化，必须更新本文件或在 retrospective 中说明无需更新的原因。

## Data Model

### Daily Report Source Registry

`DailyReportSource` keeps source occurrence rows for rendered daily reports. Refinement adds report-local stable source identity and source snapshots:

| Field | Purpose |
| --- | --- |
| `sourceNumber` | Stable numeric source ID within one report; matches `DailyReportContent.sourceIds`. |
| `sourceKey` | Recoverable key such as `item:{id}`, `cluster:{id}`, or normalized URL. |
| `sourceSummary` | Source summary snapshot used to ground refinement prompts. |
| `sourcePublishedAt` | Published timestamp snapshot. |
| `sourceQualityScore` | Quality score snapshot. |
| `eventType`, `eventSubject`, `eventAction`, `eventObject`, `eventDate` | Event signature snapshot for AI grounding. |

`DailyReportSource` is still an occurrence table. The same `sourceNumber` may appear in multiple rows when one source is cited by multiple daily report entries.

### Daily Report Refinement Sessions

`DailyReportRefinementSession` stores server-side context for one report refinement conversation:

| Field | Purpose |
| --- | --- |
| `dailyReportId` | Owning report. |
| `status` | Session lifecycle, currently `active` or `saved`. |
| `baseContentJson` | Saved report content at session creation. |
| `currentDraftJson` | Latest validated candidate for continuation. |
| `sourceRegistryJson` | Source registry snapshot sent to AI and used for validation. |
| `providerSessionId`, `providerResponseId` | Optional provider-native lineage handles. |
| `modelName` | Model used for traceability. |
| `finishedAt` | Set when a candidate is saved. |

`DailyReportRefinementMessage` stores user instructions, assistant raw output, validated `candidateJson`, and error messages.

Source recall expands only `DailyReportRefinementSession.sourceRegistryJson` while the conversation is in progress. Recalled sources are not written to `DailyReportSource` until a validated candidate cites their assigned `sourceNumber` and the admin saves that candidate. Recalled sources preserve their original same-day `DailyReportCandidate.id` as `sourceNumber`, so candidate-number recall and saved source references stay stable.

Refinement sessions and messages are persisted in the database and currently have no TTL or cleanup job. Closing the refinement modal does not clear the session. Reopening or refreshing the page can restore the latest active session through `/refine/session`, including visible messages and `sourceRegistryJson`.

The UI supports "新对话" as a reset: it marks the old active session as `discarded`, clears the current page's `sessionId`, messages, unsaved candidate, temporary source search results, and expanded registry. The next refinement or source recall request omits `sessionId`, causing the backend to create a new session from the currently saved report content.

### Prompt Config Types

`PromptConfigType` now keeps three daily-report prompt surfaces separate:

| Type | Label | Purpose |
| --- | --- | --- |
| `daily_report` | AI 日报 | Initial report generation from candidate articles. |
| `daily_report_refinement_chat` | 日报微调对话 | Natural-language discussion and clarification before generating a candidate. |
| `daily_report_refinement_generate` | 日报微调生成 | JSON candidate generation from current content, source registry, history, and instruction. |

Default prompt configs are seeded for all three types. Existing databases are backfilled by `ensureRuntimeConfigSeeded()` when the app starts, so adding the enum values does not require rewriting existing prompt rows.

The default `daily_report_refinement_generate` user prompt keeps the newest administrator instruction at the end of the rendered prompt, after the current report, source registry, and conversation history. This preserves a longer stable prefix for provider-side prompt caching without switching to provider conversation state. Existing rows are upgraded only when they still exactly match the old built-in default; customized prompt configs are left untouched.

## Migrations

The refinement schema is additive: nullable fields on `DailyReportSource`, plus two new refinement tables. Existing reports without `sourceNumber` are recovered best-effort from same-day candidate rows by `itemId`, `clusterId`, or URL; if the saved content cannot map to a complete registry, refinement fails closed with `source_registry_unavailable`.

Docker startup uses `scripts/setup-sqlite.mjs` rather than Prisma migrations. When adding nullable fields that are indexed, update both `prisma/schema.prisma` and the incremental migration block in `setup-sqlite.mjs`. The startup script must add columns before creating indexes for existing SQLite databases because `CREATE TABLE IF NOT EXISTS` does not alter old tables.

## Rollback Notes

Hide the UI and disable the admin refinement routes first. Existing daily report rendering remains compatible because new source fields are nullable and session tables are not read by public report paths. A permanent rollback can drop the refinement session tables and the nullable source snapshot fields after in-flight sessions are no longer needed.

## Open Questions

N/A

## Assumptions

N/A

## Risks

N/A

## Validation

- `npm test -- tests/unit/ai-provider.test.ts tests/unit/daily-report.test.ts tests/integration/daily-report-service.test.ts tests/integration/daily-report-cache-version.test.ts`
- `npx tsc --noEmit`
- `docker compose up -d --build` followed by `curl` checks against `http://localhost:3001/`, `/api/daily`, and `/api/feed`
