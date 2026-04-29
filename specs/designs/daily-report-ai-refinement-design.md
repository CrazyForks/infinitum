---
forge_loop: true
artifact: design
slug: daily-report-ai-refinement
status: ready
gate: H2
blocking: false
contract_required: true
adr_required: false
---

# Design: daily-report-ai-refinement

| Field | Value |
| --- | --- |
| Status | ready |
| Owner | human |
| Requirement | `specs/requirements/daily-report-ai-refinement.md` |
| Requirement Review | `specs/requirements/daily-report-ai-refinement-review.md` |
| Contract Required | yes |
| Contract Reason | Admin streaming API, auth, persisted refinement session, report-local source registry, save contract |
| ADR Required | no |
| ADR Reason | The approach extends existing daily report/admin/provider patterns and is reversible; no surprising long-term architecture decision is required. |
| ADR Path | N/A |

## Domain Language

| Term | Meaning / Source |
| --- | --- |
| AI 日报 | `DailyReport` plus `DailyReportContent`, rendered markdown, status, and selected source references. |
| 微调 session | Server-side refinement state for one report, including base content, current draft, source registry, provider-native continuation handle when available, and message history. |
| sourceNumber | A report-local stable numeric source id. It is the same number used in `DailyReportContent.sourceIds` and is persisted with the report source snapshot. |
| source registry | The list of sourceNumber -> source metadata snapshots sent to AI for grounding and source validation. |

## Context

The refinement flow starts from the report the admin is currently seeing, not from a fresh candidate generation pass. The source of truth is `DailyReport.summaryJson`; `renderedMarkdown` is a display/export artifact regenerated from validated content. If a future generation call stores a provider-native session or response id, refinement may reuse it as lineage, but it must not override the saved report state.

The AI receives two required context blocks: the current structured report content and the report-local source registry. The model may rearrange, compress, expand, or rewrite sections according to the admin instruction, but it can only cite sources from the supplied registry.

## Current Architecture

- `generateDailyReport` builds `DailyReportCandidate[]`, calls `AiProvider.generateDailyReport`, validates JSON with `parseDailyReportContent`, renders markdown with `renderDailyReportMarkdown`, then saves `DailyReport` and `DailyReportSource` rows.
- `DailyReportContent.sourceIds` are numeric ids derived from candidate order during generation.
- `DailyReportSource` stores selected source occurrence metadata (`itemId`, `clusterId`, `sourceName`, `title`, `url`, `sectionName`, `topic`) but does not persist the original numeric candidate id.
- `DailyReportDetail` displays `renderedMarkdown`; admins can regenerate, publish, unpublish, delete, and export.
- Admin APIs use `requireAdmin()` and `adminErrorResponse()`.

## Proposed Solution

Add an admin-only conversation-first refinement flow:

1. Admin opens a report detail page and clicks the bottom-center floating AI refinement button.
2. Server loads the saved `DailyReport.summaryJson` and builds a source registry from persisted source snapshots.
3. Normal turns use `mode=chat`: the provider streams a natural-language assistant reply, the service persists user/assistant messages, and no candidate JSON is generated.
4. Admin can search same-day candidates by keyword. Search results exclude sources already present in the session registry. Adding a result appends it to `sourceRegistryJson` with the next report-local `sourceNumber`.
5. When the admin explicitly clicks generate, the UI calls `mode=generate`. The provider returns full `DailyReportContent` JSON based on current content, conversation history, and the expanded source registry.
6. Server validates the final candidate using `parseDailyReportContent` against the report-local max `sourceNumber`, then verifies every used `sourceId` exists in the registry.
7. Candidate content is stored on the refinement session, not immediately written to `DailyReport`.
8. Admin saves the candidate. Save is allowed only for draft reports; published reports return a conflict telling the admin to unpublish first.
9. Save updates `summaryJson`, `renderedMarkdown`, source occurrence rows, `generatedAt` or equivalent updated timestamp, and invalidates daily report cache.

New conversation control is frontend-owned in this iteration:

- Clicking "新对话" clears the current page's `sessionId`, chat messages, unsaved candidate, temporary source search results, and expanded source registry.
- Existing database session/message rows are not deleted.
- The next chat/generate/search call omits `sessionId`, so the backend creates a fresh session from the currently saved report content and currently saved report sources.
- Unsaved recalled sources and unsaved candidates from the abandoned session do not carry over.

### Stable Source ID Scheme

Keep `DailyReportContent.sourceIds: number[]`. Do not switch to strings in this iteration.

Persist the report-local numeric id as `DailyReportSource.sourceNumber` for every source occurrence. During generation:

- Candidate `id` remains the prompt-visible numeric id.
- When creating `DailyReportSource` rows, save `sourceNumber = item.sourceId`.
- If the same source is cited in multiple sections/topics, multiple rows may share the same `sourceNumber`; this is expected because the table currently represents source occurrences.
- Build the source registry by grouping `DailyReportSource` rows by `sourceNumber` and taking the first snapshot per number.

Add source snapshot fields to support AI grounding without relying on mutable `Item`/`ContentCluster` rows:

- `sourceNumber Int?`
- `sourceKey String?` where possible: `item:{itemId}`, `cluster:{clusterId}`, otherwise `url:{normalizedUrl}`
- `sourceSummary String?`
- `sourcePublishedAt DateTime?`
- `sourceQualityScore Int?`
- optional event fields copied from the candidate (`eventType`, `eventSubject`, `eventAction`, `eventObject`, `eventDate`)

For existing reports where `sourceNumber` is absent, the refinement service attempts a best-effort recovery by matching saved `DailyReportSource` rows to same-day candidates by `itemId`, `clusterId`, or URL. If any `summaryJson.sourceIds` cannot be mapped to a recovered registry, refinement is disabled for that report with a clear admin message: regenerate the report first to create stable source ids.

## Fragile Assumption

| Assumption | If False | Design Response |
| --- | --- | --- |
| Existing numeric `sourceIds` can remain the report-local citation contract. | The AI output, validator, renderer, prompt, and stored content would need a larger string-id migration. | Block implementation and redesign around a normalized source-ref table plus content schema migration. |

## Alternatives Considered

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| Reuse original AI generation call as the only conversation start | Potentially lower prompt size for newly generated reports. | Historical reports cannot continue; provider-specific; may ignore saved repaired content. | Rejected as sole source. Keep as optional lineage only. |
| Current report + source registry + server-side session | Works for existing saved state, provider-compatible, debuggable. | Needs session persistence and source registry. | Chosen. |
| Change `sourceIds` to stable strings | Globally clearer ids. | Larger breaking change across types, prompts, validator, renderer, tests, and saved JSON. | Rejected for this iteration. |
| Add a normalized `DailyReportSourceRef` table now | Cleaner model. | Larger migration and repository rewrite than needed for the feature. | Defer unless duplicate source occurrence handling becomes painful. |

## Data Model Changes

Add nullable fields to `DailyReportSource`:

- `sourceNumber Int?`
- `sourceKey String?`
- `sourceSummary String?`
- `sourcePublishedAt DateTime?`
- `sourceQualityScore Int?`
- optional event snapshot fields.

Add indexes:

- `@@index([dailyReportId, sourceNumber])`
- `@@index([dailyReportId, sourceKey])`

Add refinement session persistence:

- `DailyReportRefinementSession`: `id`, `dailyReportId`, `status`, `baseContentJson`, `currentDraftJson`, `sourceRegistryJson`, `providerSessionId`, `providerResponseId`, `modelName`, `createdAt`, `updatedAt`, `finishedAt`.
- `DailyReportRefinementMessage`: `id`, `sessionId`, `role`, `content`, `candidateJson`, `errorMessage`, `createdAt`.

Migration is additive. Rollback drops refinement session tables and nullable source snapshot fields after ensuring no in-flight sessions are needed.

## API Changes

See `specs/contracts/daily-report-ai-refinement-contract.md`.

Required endpoints:

- `POST /api/admin/daily-reports/[date]/refine` streams one refinement turn in `chat` or `generate` mode.
- `POST /api/admin/daily-reports/[date]/refine/save` saves the latest validated candidate.
- `POST /api/admin/daily-reports/[date]/refine/sources/search` searches unselected same-day candidates by keyword and creates/resumes a session.
- `POST /api/admin/daily-reports/[date]/refine/sources/add` appends selected recall results to the session source registry.

## Shared Boundary

- API request/response and stream event shapes.
- Auth rules: admin-only.
- `DailyReportContent` remains the persisted content shape.
- `sourceNumber` is the report-local stable id used in AI prompts and validation.
- Published reports cannot be overwritten by refinement save.

## Frontend Changes

- Add an admin-only bottom-center floating refinement entry in `DailyReportDetail`.
- Click opens a modal dialog with current session messages, streaming state, keyword recall controls, source context list, final candidate preview, validation errors, and save button.
- Keep ordinary conversation separate from candidate generation; only the explicit generate button produces a saveable preview.
- Add a "新对话" action in the dialog header. If current state is non-empty, confirm before clearing local session state.
- Disable save for published reports and show a direct explanation to unpublish first.
- Do not mutate the visible article until save succeeds; preview can render separately.

## Backend Changes

- Add refinement service functions:
  - load report and build source registry.
  - create or resume session.
  - call AI provider with streaming chat replies.
  - call AI provider with JSON candidate generation only on explicit generate.
  - search same-day unselected candidates by keyword and add selected results to session registry.
  - validate candidate content.
  - save validated candidate to report.
- Extend `AiProvider` with separate refinement chat and candidate streaming methods isolated from existing `generateDailyReport`.
- Update generation save path to persist `sourceNumber` and source snapshots.
- Add cache invalidation after save.

## Edge Cases

- Published report save returns conflict and leaves report unchanged.
- Failed report cannot be refined.
- Missing or unrecoverable source registry disables refinement for that report.
- Streaming interruption stores an error message but no saveable candidate.
- Invalid AI JSON is either repaired once or rejected without overwriting the report.
- Session belongs to a report date; cross-date reuse is rejected.

## Security Considerations

- All endpoints call `requireAdmin()`.
- Stream must not expose API keys, prompt config internals, or hidden admin secrets.
- User instructions are treated as untrusted input; system prompt must keep source registry and JSON schema constraints authoritative.
- Save validates server-side content; frontend validation is advisory only.

## Performance Considerations

- Source registry should include selected report sources, not the full candidate pool, to keep token cost bounded.
- Store source summaries as snapshots so refinement does not repeatedly join large article bodies.
- Stream keeps UI responsive but final save waits for full validated content.
- Session history should cap retained turns or compact older turns if context grows too large.

## Rollback Plan

- Hide the refinement UI entry.
- Return 404 or 501 from refinement endpoints.
- Existing reports still render because source snapshot fields and session tables are additive.
- Drop refinement tables and nullable fields in a follow-up migration if permanently reverting.

## Test Strategy

| Layer | Coverage | Command |
| --- | --- | --- |
| unit | source registry grouping, source id validation, published-save rejection | `npm test -- tests/unit/daily-report.test.ts` |
| unit | AI provider streaming adapter with mocked client | `npm test -- tests/unit/ai-provider.test.ts` |
| integration | refinement save updates `summaryJson`, `renderedMarkdown`, source rows, cache version | `npm test -- tests/integration/daily-report-service.test.ts tests/integration/daily-report-cache-version.test.ts` |
| full | project regression | `npm test` |

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| Should source snapshot include full article text? | human | no | Default no; include summary and metadata only to control token cost. |
| Should refinement history be visible after page reload? | human | no | Persist minimal session/messages for reload and debugging, but no full version-history UI in this iteration. |

## Assumptions

- The user approved the recommended source-of-truth model on 2026-04-29.
- Stable source ids only need to be stable within one daily report.
- Current numeric `sourceIds` remain acceptable to the AI prompt and validator.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Existing reports lack sourceNumber | Some old reports cannot safely refine. | Best-effort recovery; block with regenerate instruction if recovery is incomplete. |
| Provider streaming/session support differs by baseURL | Feature may work differently across providers. | Server-side session history is the compatibility baseline; provider-native continuation is optional. |
| Duplicate source rows share one sourceNumber | Registry grouping must be correct. | Treat `DailyReportSource` rows as occurrences and group by `sourceNumber` for registry. |

## Validation

- H1 was approved with `npx @shawnxie666/forge-loop approve H1 --slug daily-report-ai-refinement`.
- Design is based on current `DailyReport`, `DailyReportSource`, validator, renderer, repository, admin auth, and API route patterns.
