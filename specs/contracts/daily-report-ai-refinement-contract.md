---
forge_loop: true
artifact: contract
slug: daily-report-ai-refinement
status: ready
gate: H2
blocking: false
---

# Contract: daily-report-ai-refinement

| Field | Value |
| --- | --- |
| Status | ready |
| Version | v1 |
| Owner | human |
| Requirement | `specs/requirements/daily-report-ai-refinement.md` |
| Design | `specs/designs/daily-report-ai-refinement-design.md` |

## API Endpoints

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/admin/daily-reports/[date]/refine` | Run one streaming refinement turn. `chat` persists an assistant message; `generate` persists a validated candidate. | `requireAdmin()` |
| POST | `/api/admin/daily-reports/[date]/refine/save` | Save the latest validated candidate from a session to the draft report. | `requireAdmin()` |
| POST | `/api/admin/daily-reports/[date]/refine/sources/search` | Search same-day unselected candidates by keyword for the current refinement session. | `requireAdmin()` |
| POST | `/api/admin/daily-reports/[date]/refine/sources/add` | Add selected recalled sources to the session source registry. | `requireAdmin()` |

## Request Schema

### `POST /api/admin/daily-reports/[date]/refine`

| Field | Type | Required | Validation | Notes |
| --- | --- | --- | --- | --- |
| `sessionId` | `string` | no | Existing session for the same report date. | Omitted means create a new session. |
| `instruction` | `string` | yes | Trimmed length 1..2000. | Admin's refinement instruction. |
| `mode` | `"chat" \| "generate"` | no | Defaults to `"chat"`. | `chat` streams natural-language discussion; `generate` returns a validated candidate. |

### `POST /api/admin/daily-reports/[date]/refine/save`

| Field | Type | Required | Validation | Notes |
| --- | --- | --- | --- | --- |
| `sessionId` | `string` | yes | Existing session for the same report date. | Must contain a validated candidate. |
| `messageId` | `string` | no | Message belongs to session and has `candidateJson`. | Defaults to latest validated assistant message. |

### `POST /api/admin/daily-reports/[date]/refine/sources/search`

| Field | Type | Required | Validation | Notes |
| --- | --- | --- | --- | --- |
| `sessionId` | `string` | no | Existing session for the same report date. | Omitted means create a new session from the current report. |
| `query` | `string` | yes | Trimmed length 1..120. | Keyword matched against title, source, URL, summary, and event metadata. `#12` or `12` performs exact `candidateNumber` recall. |
| `limit` | `number` | no | Integer 1..20. | Defaults to 10. |

### `POST /api/admin/daily-reports/[date]/refine/sources/add`

| Field | Type | Required | Validation | Notes |
| --- | --- | --- | --- | --- |
| `sessionId` | `string` | yes | Existing session for the same report date. | Source registry is updated on this session. |
| `sourceKeys` | `string[]` | yes | 1..20 non-empty keys. | Keys must exist in same-day candidates and not already be in the registry. |

## Response Schema

### Refine Stream Events

The refine endpoint returns `text/event-stream` with JSON payloads:

| Event | Payload Fields | Required | Notes |
| --- | --- | --- | --- |
| `session` | `sessionId`, `reportDate`, `sourceRegistryVersion` | yes | First event when session is created or resumed. |
| `message_delta` | `text` | no | Human-readable streaming assistant output for `chat` mode. |
| `message_done` | `messageId` | yes on chat success | Assistant chat message was persisted. |
| `candidate` | `messageId`, `content`, `renderedMarkdown` | yes on generate success | `content` is validated `DailyReportContent`. |
| `error` | `code`, `message` | yes on failure | Stream ends after this event. |
| `done` | `ok` | yes | Final event. |

### Source Search JSON Response

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sessionId` | `string` | yes | Created or resumed session. |
| `reportDate` | `string` | yes | Normalized report date. |
| `sourceRegistryVersion` | `string` | yes | Hash of the registry before adding search results. |
| `sources` | `DailyReportRefinementSourceSearchResult[]` | yes | Matching unselected sources. |

### Source Add JSON Response

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sessionId` | `string` | yes | Updated session. |
| `reportDate` | `string` | yes | Normalized report date. |
| `sourceRegistryVersion` | `string` | yes | Hash after adding sources. |
| `sourceRegistry` | `DailyReportSourceRegistryEntry[]` | yes | Expanded source registry with new report-local source numbers. |

### Save JSON Response

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `report` | `DailyReportDetailDTO` or minimal report snapshot | yes | Updated report after save. |
| `saved` | `boolean` | yes | True on success. |

## Error Codes

| Code | HTTP Status | Meaning | Client Action |
| --- | --- | --- | --- |
| `unauthorized` | 401 | Missing or invalid admin session. | Redirect to admin login. |
| `not_found` | 404 | Report or session does not exist. | Refresh page. |
| `invalid_report_status` | 409 | Report is failed or published when saving. | Unpublish first or choose another report. |
| `source_registry_unavailable` | 409 | Existing report cannot build a complete stable source registry. | Regenerate the report. |
| `invalid_instruction` | 400 | Instruction is empty or too long. | Edit instruction. |
| `invalid_query` | 400 | Source recall query is empty or too long. | Edit query. |
| `invalid_source_keys` | 400 | No source key or too many source keys were provided. | Select 1..20 sources. |
| `source_not_found` | 404 | Selected source keys are unavailable or already present. | Search again. |
| `invalid_ai_output` | 422 | AI output cannot be parsed or violates source/schema constraints. | Retry with narrower instruction. |
| `provider_error` | 502 | Model API failed. | Retry later or check model config. |

## Auth Rules

| Actor | Allowed Actions | Denied Actions | Notes |
| --- | --- | --- | --- |
| Admin | Start/resume refinement, receive stream, save candidate to draft report. | Save to published or failed report. | Uses existing admin cookie session. |
| Anonymous/non-admin | N/A | All refinement endpoints. | Must not receive draft content or source registry. |

## Shared Types

```ts
type DailyReportSourceRegistryEntry = {
  sourceNumber: number;
  sourceKey: string;
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  qualityScore: number | null;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

type DailyReportRefineRequest = {
  sessionId?: string;
  instruction: string;
  mode?: "chat" | "generate";
};

type DailyReportRefineStreamEvent =
  | { event: "session"; sessionId: string; reportDate: string; sourceRegistryVersion: string }
  | { event: "message_delta"; text: string }
  | { event: "message_done"; messageId: string }
  | { event: "candidate"; messageId: string; content: DailyReportContent; renderedMarkdown: string }
  | { event: "error"; code: string; message: string }
  | { event: "done"; ok: boolean };

type DailyReportRefineSaveRequest = {
  sessionId: string;
  messageId?: string;
};

type DailyReportRefinementSourceSearchResult = {
  candidateNumber: number;
  sourceKey: string;
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  qualityScore: number | null;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

type DailyReportRefinementSourceSearchRequest = {
  sessionId?: string;
  query: string;
  limit?: number;
};

type DailyReportRefinementSourceAddRequest = {
  sessionId: string;
  sourceKeys: string[];
};
```

## State Transitions

| From | Event | To | Allowed | Notes |
| --- | --- | --- | --- | --- |
| no session | refine request | active session | yes | Creates session from current saved report content. |
| active session | chat refine request | active session | yes | Appends user message and assistant natural-language reply. |
| active session | source search | active session | yes | Returns matching unselected candidates without changing registry. |
| active session | source add | active session | yes | Expands session registry only; official report sources remain unchanged. |
| active session | generate refine request | candidate ready | yes | Candidate stored on session only. |
| candidate ready + draft report | save | report updated | yes | Updates report and invalidates cache. |
| candidate ready + published report | save | unchanged | no | Returns `invalid_report_status`. |
| any | invalid AI output | unchanged/error message | yes | No report overwrite. |

## Mock Data

```json
{
  "sourceRegistry": [
    {
      "sourceNumber": 3,
      "sourceKey": "item:clv-item-1",
      "itemId": "clv-item-1",
      "clusterId": "clv-cluster-1",
      "sourceName": "OpenAI Blog",
      "title": "Example model update",
      "url": "https://example.com/model-update",
      "summary": "A concise source summary used for grounding.",
      "publishedAt": "2026-04-29T08:00:00.000Z",
      "qualityScore": 86,
      "eventType": "release",
      "eventSubject": "Example Model",
      "eventAction": "released",
      "eventObject": "new capability",
      "eventDate": "2026-04-29"
    }
  ],
  "refineRequest": {
    "instruction": "把安全与风险提前，并压缩开头摘要。"
  }
}
```

## Contract Tests

- Non-admin requests return 401.
- Refine returns `source_registry_unavailable` when current content source ids cannot map to a registry.
- Chat refine stream emits `session`, zero or more `message_delta`, `message_done`, then `done` on valid output.
- Generate refine stream emits `session`, one `candidate`, then `done` on valid output.
- Source search excludes sources already present in the session registry.
- Source add assigns the next report-local `sourceNumber` and updates only the session registry.
- Invalid AI source id returns `invalid_ai_output` and does not create a saveable candidate.
- Save to published report returns 409 and leaves `summaryJson` unchanged.
- Save to draft report updates content, rendered markdown, source rows, and cache version.

## Change Control

- Contract 修改必须同步更新 design、task plan 和 execution plan。
- 实现阶段不得擅自修改本文件。

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| Should the stream event protocol be SSE or newline-delimited JSON? | human | no | Default SSE because browser `EventSource`/stream parsing fits incremental UI. |

## Assumptions

- `DailyReportContent` remains the content schema.
- `sourceNumber` is stable within a single report, not globally.
- Provider-native continuation handles are optional metadata, not the source of truth.

## Risks

- Different OpenAI-compatible providers may expose streaming and continuation differently; the server-side session is the compatibility layer.
- Existing reports may need regeneration if source registry recovery is incomplete.

## Validation

- Contract reflects current admin auth and daily report route conventions.
- Contract covers the API, auth, shared type, state, and error boundaries required before H3 planning.
