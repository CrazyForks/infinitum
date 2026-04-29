---
forge_loop: true
artifact: task-result
slug: daily-report-ai-refinement
task_id: T6
status: implemented
blocking: false
---

# Task Result T6: Conversation-First Refinement And Source Recall Expansion

## Summary

Implemented the user-approved expansion: refinement is now conversation-first, source recall can add unselected same-day candidates to the session context, and the UI entry moved to a bottom-center floating button that opens a dialog.

## Changes

- Split refinement streaming into `chat` and `generate` modes.
- Added a non-JSON provider chat stream and kept JSON response format for candidate generation.
- Added source recall endpoints:
  - `POST /api/admin/daily-reports/[date]/refine/sources/search`
  - `POST /api/admin/daily-reports/[date]/refine/sources/add`
- Added service logic to exclude existing registry sources from search and assign added sources the next report-local `sourceNumber`.
- Added a persisted session message when sources are added, so a source recalled before the first chat turn is explicit in subsequent chat/generate context.
- Changed recalled-source numbering to preserve the original `candidateNumber` instead of assigning `max(sourceNumber)+1`.
- Added latest active refinement session restore/discard APIs so refreshed or reopened dialogs can recover the current source context, while "新对话" discards the old active session.
- Extended source recall query to support exact `candidateNumber` matching with `#12` or `12`.
- Replaced the inline article-top refinement panel with a bottom-center floating entry and modal dialog.
- Added a dialog-level "新对话" action that confirms before clearing local session state when the current conversation has content.
- Moved refinement actions into icon buttons below the input area, moved source count to the source context header, and changed source recall results to a selection modal.
- Adjusted the dialog polish after UX feedback: refinement actions are text buttons again, the source context list fills the right-side height, the modal body no longer scrolls as chat grows, chat bubbles and recall results render safe Markdown, and source scores are visible in recall/context lists.
- Applied the latest dialog copy polish: renamed the entry and modal title to "日报微调", renamed "来源召回" to "新增召回", removed the draft-state guidance banner, and moved source-context scores into bordered badges after the `#` source number.
- Added two admin prompt config types for "日报微调对话" and "日报微调生成", keeping them separate from the existing "AI 日报" initial generation prompt. Provider chat/generate refinement now read these configured prompts with default fallback and seed/backfill support.
- Optimized prompt-cache friendliness without switching to Responses conversation state: the default "日报微调生成" user prompt now places the newest administrator instruction after the stable current report, source registry, and history prefix, and untouched legacy default rows are backfilled to the new order while customized configs are preserved.
- Added tests for chat turns, keyword/candidate-number recall, source add, and saving a candidate that cites a recalled source.

## Contract Compliance

Pass. API, event names, and source registry behavior now match the expanded contract.

## Spec Compliance Review

Pass. The implementation satisfies AC8-AC10 and preserves the existing save/publish/source validation safety boundaries.

## Code Quality Review

Pass. The new mode split keeps chat and candidate generation separate in the provider/service boundary, and source recall only mutates session state until a candidate is saved.

## Verification

- `npx tsc --noEmit` passed.
- `npm test -- tests/unit/ai-provider.test.ts tests/integration/daily-report-service.test.ts` passed: 2 files, 28 tests.
- `npm test -- tests/integration/daily-report-service.test.ts` passed: 1 file, 12 tests, after the dialog polish changes.
- `npm test -- tests/integration/daily-report-service.test.ts` passed: 1 file, 12 tests, after adding coverage for source recall before the first chat turn.
- `npm test -- tests/integration/daily-report-service.test.ts` passed: 1 file, 12 tests, after preserving candidate numbers and restoring latest active sessions.
- `npm run lint` passed with one existing warning in `src/components/admin/admin-page-client.tsx`.
- `npm run build` passed.
- `npx @shawnxie666/forge-loop validate --slug daily-report-ai-refinement` passed.
- `npx tsc --noEmit` passed after the latest dialog copy polish.
- `npm run lint` passed after the latest dialog copy polish with the same existing warning in `src/components/admin/admin-page-client.tsx`.
- `npm run build` passed after the latest dialog copy polish.
- `npx @shawnxie666/forge-loop validate --slug daily-report-ai-refinement` passed after the latest dialog copy polish.
- `docker compose up -d --build` rebuilt and started the local app/worker images; `curl -I http://localhost:3001/` returned `200 OK`.
- `npx tsc --noEmit` passed after adding the two 日报微调 prompt config types.
- `npm test -- tests/unit/ai-provider.test.ts` passed: 1 file, 16 tests, covering configured refinement chat/generate prompts.
- `npm test -- tests/integration/admin-settings-service.test.ts -t "seeds code defaults|uses enabled default configs"` passed: 2 tests, covering default prompt config seed/runtime mapping.
- `npm test -- tests/integration/daily-report-service.test.ts` passed: 1 file, 12 tests, after the prompt config split.
- `npm run lint` passed after the prompt config split with the same existing warning in `src/components/admin/admin-page-client.tsx`.
- `npm run build` passed after the prompt config split.
- `docker compose up -d --build` rebuilt and restarted the local app/worker after the prompt config split; `curl -I http://localhost:3001/` returned `200 OK`.
- `npm run prisma:generate && npx tsc --noEmit` passed after the cache-friendly prompt ordering change.
- `npm test -- tests/integration/admin-settings-service.test.ts -t "seeds code defaults|uses enabled default configs|upgrades the untouched legacy default daily report refinement generate template"` passed: 3 tests, covering default prompt config seed/runtime mapping and untouched legacy prompt upgrade.
- `npm test -- tests/unit/ai-provider.test.ts` passed: 1 file, 16 tests, after the cache-friendly prompt ordering change.
- `npm test -- tests/integration/daily-report-service.test.ts` passed: 1 file, 12 tests, after the cache-friendly prompt ordering change.
- `npm run lint` passed after the cache-friendly prompt ordering change with the same existing warning in `src/components/admin/admin-page-client.tsx`.
- `npm run build` passed after the cache-friendly prompt ordering change.
- `npx @shawnxie666/forge-loop validate --slug daily-report-ai-refinement` passed after the cache-friendly prompt ordering change.
- `docker compose up -d --build` rebuilt and restarted the local app/worker after the cache-friendly prompt ordering change; `curl -I http://localhost:3001/` returned `200 OK`.
- `npm test` failed in the same unrelated admin settings/task monitor areas: 3 files failed, 45 passed; 9 tests failed, 337 passed.

## Known Issues

- Authenticated browser QA for the dialog was not executed in this turn because it requires local admin login credentials.
- Existing full-suite failures from the previous H4 evidence remain outside this feature scope.

## Risks

- Route-level authenticated tests for the new source recall endpoints are still a useful follow-up; service tests cover the core behavior.
