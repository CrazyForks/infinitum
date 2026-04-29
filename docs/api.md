# API

Status: draft

本文件用于沉淀长期 API 知识。每次迭代如果涉及 API 变化，必须更新本文件或在 retrospective 中说明无需更新的原因。

## APIs

### Daily Report AI Refinement

Admin-only endpoints for iteratively refining saved AI daily report content.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/daily-reports/[date]/refine` | Start or continue one refinement session turn and stream SSE events in chat or generate mode. |
| `GET` | `/api/admin/daily-reports/[date]/refine/session` | Restore the latest active refinement session, including source registry and visible chat messages. |
| `DELETE` | `/api/admin/daily-reports/[date]/refine/session` | Discard an active refinement session when the admin starts a new conversation. |
| `POST` | `/api/admin/daily-reports/[date]/refine/save` | Save a validated refinement candidate back to a draft report. |
| `POST` | `/api/admin/daily-reports/[date]/refine/sources/search` | Search same-day candidates that are not yet in the session source registry. |
| `POST` | `/api/admin/daily-reports/[date]/refine/sources/add` | Add selected recalled sources to the session source registry. |

`/refine` request body:

```json
{
  "sessionId": "optional-existing-session-id",
  "instruction": "把安全与风险提前，并压缩开头摘要。",
  "mode": "chat"
}
```

`mode` defaults to `chat`. Chat mode streams a natural-language assistant reply and does not create a candidate. Use `mode: "generate"` only when the admin explicitly asks to generate a saveable candidate.

`/refine` returns `text/event-stream` events with JSON `data` payloads:

| Event | Meaning |
| --- | --- |
| `session` | Session is created or resumed; includes `sessionId`, `reportDate`, and `sourceRegistryVersion`. |
| `message_delta` | Incremental assistant message text for chat mode. |
| `message_done` | Chat assistant message was persisted; includes `messageId`. |
| `candidate` | Validated `DailyReportContent` plus rendered markdown preview for generate mode. |
| `error` | Refinement failed after stream creation. |
| `done` | Final stream event with `ok`. |

`/refine/save` request body:

```json
{
  "sessionId": "required-session-id",
  "messageId": "optional-candidate-message-id"
}
```

Save only writes to draft reports. Published reports must be unpublished first.

`/refine/sources/search` request body:

```json
{
  "sessionId": "optional-existing-session-id",
  "query": "Claude Code",
  "limit": 10
}
```

The response includes `sessionId`, `sourceRegistryVersion`, and `sources`. Results are same-day candidates whose `sourceKey` is not already in the current session registry.
`query` supports normal keyword matching and exact candidate-number matching: `#12` or `12` returns candidate 12 if it is not already in the session registry.

`/refine/sources/add` request body:

```json
{
  "sessionId": "required-session-id",
  "sourceKeys": ["item:example"]
}
```

Adding sources only updates `DailyReportRefinementSession.sourceRegistryJson`. Recalled sources keep their original candidate number as `sourceNumber`; official report source rows are updated later only if a saved candidate cites those new `sourceNumber` values.

`/refine/session` `GET` response:

```json
{
  "session": {
    "id": "active-session-id",
    "reportDate": "2026-04-24",
    "sourceRegistryVersion": "hash",
    "sourceRegistry": [],
    "messages": []
  }
}
```

`/refine/session` `DELETE` request body:

```json
{
  "sessionId": "required-session-id"
}
```

## Error Codes

| Code | Status | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | Missing or invalid admin session. |
| `not_found` | 404 | Report or session does not exist. |
| `invalid_report_status` | 409 | Report cannot be refined or saved in its current status. |
| `source_registry_unavailable` | 409 | The saved report cannot map content source IDs to a stable source registry. |
| `invalid_instruction` | 400 | Instruction is empty or longer than 2000 characters. |
| `invalid_query` | 400 | Source recall query is empty or longer than 120 characters. |
| `invalid_source_keys` | 400 | Source add request contains no source keys or too many source keys. |
| `source_not_found` | 404 | Requested source keys cannot be added. |
| `invalid_ai_output` | 422 | AI output cannot be parsed or violates report/source constraints. |
| `provider_error` | 502 | Model API failed during refinement. |

## Auth Rules

Daily report refinement endpoints require `requireAdmin()`. Anonymous users must not receive draft content, source registry metadata, session history, or candidate previews.

## Open Questions

N/A

## Assumptions

N/A

## Risks

N/A

## Validation

- Added during `daily-report-ai-refinement`.
- Covered by provider and daily report service tests; see `docs/testing.md`.
