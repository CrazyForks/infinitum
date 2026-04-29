---
forge_loop: true
artifact: task-plan
slug: daily-report-ai-refinement
status: implemented
gate: H3
blocking: false
parallel_execution: false
---

# Task Plan: daily-report-ai-refinement

| Field | Value |
| --- | --- |
| Status | implemented |
| Owner | human |
| Requirement | `specs/requirements/daily-report-ai-refinement.md` |
| Design | `specs/designs/daily-report-ai-refinement-design.md` |
| Contract | `specs/contracts/daily-report-ai-refinement-contract.md` |
| Parallel Execution | no |
| Parallel Reason | This feature changes one shared daily-report content contract across Prisma schema, service validation, provider streaming, API routes, UI state, and tests. Sequential tracer bullets reduce contract drift and file conflicts. |
| Slice Strategy | vertical tracer bullets |

## Shared Context

- Current report content in `DailyReport.summaryJson` is the source of truth for refinement.
- Provider-native generation session lineage is optional; server-side session state is the compatibility baseline.
- Stable citation identity is report-local `sourceNumber`, persisted on `DailyReportSource` and used as the numeric `DailyReportContent.sourceIds` contract.
- Published reports cannot be overwritten by refinement save; admins must unpublish first.
- All admin endpoints must use `requireAdmin()`.

## Shared Contracts

- `specs/contracts/daily-report-ai-refinement-contract.md`

## Task Graph

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6
```

## Tasks

### T1: Persist Stable Source Registry Data

| Field | Value |
| --- | --- |
| Status | Done |
| Goal | Add additive schema and repository/service support for report-local `sourceNumber` and source snapshots. |
| Dependencies | none |
| Parallelizable | no |
| Parallel Group | sequential |
| Risk | medium |
| Branch | `agent/T1-daily-report-ai-refinement` |
| Execution Mode | AFK |
| Human Touchpoint | N/A |
| Vertical Slice | yes |
| Verification Surface | database schema, service tests, validator tests |

#### Files Allowed

- `prisma/schema.prisma`
- `src/lib/daily-report/service.ts`
- `src/lib/daily-report/repository.ts`
- `src/lib/daily-report/types.ts`
- `src/lib/daily-report/validator.ts`
- `src/lib/daily-report/renderer.ts`
- `tests/unit/daily-report.test.ts`
- `tests/integration/daily-report-service.test.ts`
- `tests/integration/daily-report-cache-version.test.ts`

#### Files Forbidden

- `src/components/**`
- `src/app/api/**`
- `src/lib/ai/provider.ts`
- `specs/**`
- `tasks/**`

#### Inputs

- `specs/designs/daily-report-ai-refinement-design.md`
- `specs/contracts/daily-report-ai-refinement-contract.md`

#### Outputs

- Additive Prisma fields for `DailyReportSource`.
- Source registry builder or repository helper.
- Generation save path persists `sourceNumber` and source snapshots.

#### Acceptance Criteria

- New generated reports persist `sourceNumber` matching the numeric IDs used in `summaryJson.sourceIds`.
- Source registry groups duplicate occurrence rows by `sourceNumber`.
- Existing reports without stable mapping fail closed with a clear error path.
- Existing daily report rendering and export behavior remains unchanged.

#### Tracer Bullet

- Generate or seed a report, build its registry, and validate that each content `sourceId` maps to a registry entry.

#### Commands To Run

- `npm run prisma:generate`
- `npm test -- tests/unit/daily-report.test.ts tests/integration/daily-report-service.test.ts tests/integration/daily-report-cache-version.test.ts`

### T2: Add AI Refinement Provider And Session Service

| Field | Value |
| --- | --- |
| Status | Done |
| Goal | Implement server-side refinement sessions, message persistence, AI streaming adapter, candidate validation, and save logic. |
| Dependencies | T1 |
| Parallelizable | no |
| Parallel Group | sequential |
| Risk | medium |
| Branch | `agent/T2-daily-report-ai-refinement` |
| Execution Mode | AFK |
| Human Touchpoint | N/A |
| Vertical Slice | yes |
| Verification Surface | service tests, provider tests |

#### Files Allowed

- `prisma/schema.prisma`
- `src/lib/ai/provider.ts`
- `src/lib/daily-report/service.ts`
- `src/lib/daily-report/repository.ts`
- `src/lib/daily-report/types.ts`
- `src/config/prompts.ts`
- `src/lib/tasks/ai-usage.ts`
- `tests/unit/ai-provider.test.ts`
- `tests/unit/daily-report.test.ts`
- `tests/integration/daily-report-service.test.ts`
- `tests/integration/daily-report-cache-version.test.ts`

#### Files Forbidden

- `src/components/**`
- `src/app/api/**`
- `specs/**`
- `tasks/**`

#### Inputs

- T1 source registry helpers.
- `specs/contracts/daily-report-ai-refinement-contract.md`

#### Outputs

- Refinement session/message models.
- Refinement service with create/resume, stream turn, validate candidate, and save candidate methods.
- Provider refinement method isolated from existing generation methods.

#### Acceptance Criteria

- A refinement turn starts from saved `summaryJson`, source registry, and instruction.
- Valid candidate content is stored on the session but does not overwrite the report until save.
- Save rejects published and failed reports.
- Save updates report content, rendered markdown, source occurrence rows, and invalidates cache.
- Provider fallback works when native continuation IDs are unavailable.

#### Tracer Bullet

- With a mocked provider, run one refinement turn and save it to a draft report; verify refreshed detail data reflects the saved candidate.

#### Commands To Run

- `npm run prisma:generate`
- `npm test -- tests/unit/ai-provider.test.ts tests/unit/daily-report.test.ts tests/integration/daily-report-service.test.ts tests/integration/daily-report-cache-version.test.ts`

### T3: Implement Admin Refinement APIs

| Field | Value |
| --- | --- |
| Status | Done |
| Goal | Expose contract-compliant admin streaming refine and save endpoints. |
| Dependencies | T2 |
| Parallelizable | no |
| Parallel Group | sequential |
| Risk | medium |
| Branch | `agent/T3-daily-report-ai-refinement` |
| Execution Mode | AFK |
| Human Touchpoint | N/A |
| Vertical Slice | yes |
| Verification Surface | API integration tests |

#### Files Allowed

- `src/app/api/admin/daily-reports/[date]/refine/**`
- `src/lib/admin/http.ts`
- `src/lib/daily-report/service.ts`
- `src/lib/daily-report/types.ts`
- `src/components/daily/daily-report.api.ts`
- `tests/integration/admin-auth-api.test.ts`
- `tests/integration/daily-report-service.test.ts`
- `tests/integration/admin-content-api.test.ts`

#### Files Forbidden

- `src/components/daily/daily-report-detail.tsx`
- `prisma/schema.prisma` except fixes required by T2
- `specs/**`
- `tasks/**`

#### Inputs

- T2 refinement service.
- Contract endpoint and error definitions.

#### Outputs

- `POST /api/admin/daily-reports/[date]/refine`
- `POST /api/admin/daily-reports/[date]/refine/save`
- Client API wrappers.

#### Acceptance Criteria

- Non-admin requests return 401.
- Empty or too-long instructions return 400.
- Missing report/session returns 404.
- Source registry failures return 409.
- Invalid AI output returns 422.
- Save to published report returns 409 without changing `summaryJson`.
- Successful stream emits `session`, optional `delta`, `candidate`, and `done`.

#### Tracer Bullet

- API test submits a refinement instruction against a draft report and saves the returned candidate.

#### Commands To Run

- `npm test -- tests/integration/admin-auth-api.test.ts tests/integration/daily-report-service.test.ts`

### T4: Add Admin Refinement UI

| Field | Value |
| --- | --- |
| Status | Done |
| Goal | Add an admin-only refinement panel to the daily report detail page with streaming messages, candidate preview, and save flow. |
| Dependencies | T3 |
| Parallelizable | no |
| Parallel Group | sequential |
| Risk | medium |
| Branch | `agent/T4-daily-report-ai-refinement` |
| Execution Mode | HITL |
| Human Touchpoint | manual QA |
| Vertical Slice | yes |
| Verification Surface | component tests, browser/manual QA |

#### Files Allowed

- `src/components/daily/daily-report-detail.tsx`
- `src/components/daily/daily-report.api.ts`
- `src/components/ui/**`
- `tests/components/**`

#### Files Forbidden

- `prisma/schema.prisma`
- `src/lib/ai/provider.ts`
- `src/lib/daily-report/service.ts` except small type alignment required by API DTOs
- `specs/**`
- `tasks/**`

#### Inputs

- T3 API wrappers.
- Existing detail page UI patterns.

#### Outputs

- Refinement panel in `DailyReportDetail`.
- Streaming state, message list, candidate preview, validation/error handling, save button.

#### Acceptance Criteria

- Panel is only visible for admins.
- Save button is disabled or blocked for published reports with a clear unpublish-first message.
- Streaming progress is visible and candidate preview does not replace the article until save succeeds.
- Save refreshes the page data after success.
- UI text fits existing detail page layout on desktop and mobile.

#### Tracer Bullet

- Admin opens a draft daily report, submits a refinement instruction, sees a candidate preview, saves it, and the rendered article updates.

#### Commands To Run

- `npm test -- tests/components`
- Manual browser QA on `/daily/[date]` as admin.

### T5: Full Regression And Documentation Touch-Up

| Field | Value |
| --- | --- |
| Status | Done |
| Goal | Run full checks, update long-term docs only if implementation introduces durable API/data behavior, and prepare H4 evidence. |
| Dependencies | T4 |
| Parallelizable | no |
| Parallel Group | sequential |
| Risk | low |
| Branch | `agent/T5-daily-report-ai-refinement` |
| Execution Mode | AFK |
| Human Touchpoint | N/A |
| Vertical Slice | yes |
| Verification Surface | full test suite, lint/build if needed |

#### Files Allowed

- `docs/api.md`
- `docs/database.md`
- `docs/testing.md`
- `tasks/results/**`
- `tests/**`

#### Files Forbidden

- `.agent-workflow/**`
- `.forge-loop/state/**`
- Unrelated app modules.

#### Inputs

- Completed T1-T4 changes.

#### Outputs

- Test evidence.
- Updated docs if API/data contract is durable enough to document outside specs.
- Task result files for implementation tasks.

#### Acceptance Criteria

- Required targeted tests pass.
- Full `npm test` passes or any failure is explained with evidence.
- Remaining risks are documented before H4 review.

#### Tracer Bullet

- A clean regression run supports closing the implementation phase and entering H4 review.

#### Commands To Run

- `npm test`
- `npm run lint`
- `npm run build`

### T6: Conversation-First Refinement And Source Recall Expansion

| Field | Value |
| --- | --- |
| Status | Done |
| Goal | Split refinement into chat vs explicit candidate generation, add keyword recall for unselected sources, and move the UI entry to a bottom-center floating button. |
| Dependencies | T5 plus human-approved scope expansion |
| Parallelizable | no |
| Parallel Group | sequential |
| Risk | medium |
| Branch | `agent/T6-daily-report-ai-refinement` |
| Execution Mode | AFK |
| Human Touchpoint | user approved expansion in chat |
| Vertical Slice | yes |
| Verification Surface | provider tests, daily report service tests, type/lint/build |

#### Files Allowed

- `src/lib/ai/provider.ts`
- `src/lib/daily-report/service.ts`
- `src/lib/daily-report/types.ts`
- `src/config/prompts.ts`
- `src/app/api/admin/daily-reports/[date]/refine/**`
- `src/components/daily/daily-report-detail.tsx`
- `src/components/daily/daily-report.api.ts`
- `tests/unit/ai-provider.test.ts`
- `tests/integration/daily-report-service.test.ts`
- `specs/**`
- `tasks/**`
- `docs/**`

#### Outputs

- `mode=chat` streams assistant messages without candidate JSON.
- `mode=generate` explicitly creates the saveable candidate.
- Source search/add admin endpoints.
- Session registry expansion with next report-local `sourceNumber`.
- Bottom-center floating AI refinement button and modal dialog UI.

#### Acceptance Criteria

- Normal conversation turns do not create candidate JSON.
- Keyword search returns only unselected same-day candidates.
- Added sources become available to candidate generation and can be persisted if cited.
- The old inline article-top refinement panel is removed.
- The floating entry is centered at the bottom of the page.

#### Commands To Run

- `npx tsc --noEmit`
- `npm test -- tests/unit/ai-provider.test.ts tests/integration/daily-report-service.test.ts`
- `npm run lint`
- `npm run build`

## Execution Waves

Sequential order:

| Wave | Tasks | Max Parallel | Notes |
| --- | --- | --- | --- |
| 0 | T1 | 1 | Establish stable source registry before any refinement behavior. |
| 1 | T2 | 1 | Build service/provider against stable source registry. |
| 2 | T3 | 1 | Expose API after service behavior is testable. |
| 3 | T4 | 1 | Add UI after API contract exists. |
| 4 | T5 | 1 | Initial regression and docs. |
| 5 | T6 | 1 | User-approved conversation/source-recall/UI-entry expansion. |

## Conflict Analysis

N/A. Parallel Execution is no. The plan intentionally serializes shared files and contracts.

## Merge Strategy

- Use one implementation branch for the feature unless the human explicitly requests subagent branches.
- Merge order is T1, T2, T3, T4, T5.
- Do not modify the H2 contract during implementation without returning to H2 or recording a contract amendment.

## Test Strategy

- T1/T2 protect the content and source registry contract with unit/integration tests.
- T3 protects admin auth and endpoint error behavior.
- T4 protects UI state with component tests plus manual browser QA.
- T5 runs full regression.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| Should source snapshot include full article text? | human | no | Default no; use summary and metadata to control token cost. |
| Should implementation use provider-native continuation first when available? | human | no | Yes, but only as optional lineage; server-side session remains required. |

## Assumptions

- The H2 design and contract are approved before implementation starts.
- No subagents are required for this first implementation pass.
- Local test database can be reset by `npm test` through existing scripts.

## Risks

- Prisma schema changes and service changes are tightly coupled; T1 and T2 must stay sequential.
- Streaming API tests may need a mock stream helper to avoid flaky timing.
- UI manual QA may require a locally generated draft report with stable source registry.

## Validation

- H2 approval recorded in `tasks/gates/daily-report-ai-refinement/H2.md`.
- Plan covers every H2 design area: source registry, provider/session service, admin API, UI, and regression.
- Parallel Execution is explicitly no, so dependency analysis and scheduling are not required.
