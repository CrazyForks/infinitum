# Testing

Status: draft

本文件用于沉淀长期测试策略。每次迭代如果涉及测试策略变化，必须更新本文件或在 retrospective 中说明无需更新的原因。

## Test Commands

| Purpose | Command |
| --- | --- |
| Type check | `npx tsc --noEmit` |
| Daily report/provider targeted regression | `npm test -- tests/unit/ai-provider.test.ts tests/unit/daily-report.test.ts tests/integration/daily-report-service.test.ts tests/integration/daily-report-cache-version.test.ts` |
| Conversation/source recall focused regression | `npm test -- tests/unit/ai-provider.test.ts tests/integration/daily-report-service.test.ts` |
| Prompt config seed/runtime mapping regression | `npm test -- tests/integration/admin-settings-service.test.ts -t "seeds code defaults\\|uses enabled default configs\\|upgrades the untouched legacy default daily report refinement generate template"` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| Docker local deployment smoke | `docker compose up -d --build` then `curl http://localhost:3001/`, `/api/daily`, and `/api/feed` |
| Full regression | `npm test` |

## Test Strategy

Daily report AI refinement is covered primarily through service/provider tests:

- Provider unit tests verify candidate-generation streams use JSON response format, while chat refinement streams do not request JSON response format.
- Daily report service integration tests verify generation persists `sourceNumber` and source snapshots, chat turns do not create candidate JSON, keyword and candidate-number recall exclude already selected sources, added sources receive stable source numbers, refinement streams and saves candidates, published reports reject save, old report source numbers can be recovered, and invalid AI output emits `invalid_ai_output`.
- Browser/manual QA should confirm the admin-only bottom-center floating entry opens the refinement dialog, candidate previews do not replace article content before save, keyword recall can add sources, and published reports require unpublish before saving.

## Required Coverage

Core behavior should be covered at the public service/API seam instead of private helper call order. Component coverage is useful for the admin panel but does not replace service validation because save safety and source ID checks are server-side.

## Open Questions

N/A

## Assumptions

N/A

## Risks

N/A

## Validation

Updated during `daily-report-ai-refinement`.
