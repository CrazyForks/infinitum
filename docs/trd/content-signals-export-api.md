---
id: trd-content-signals-export-api
type: trd
status: draft
created_at: 2026-06-29
updated_at: 2026-06-29
sources:
  - AGENTS.md
  - prisma/schema.prisma
  - src/lib/admin/session.ts
related:
  - docs/rss-usage.md
---

# TRD: Content Signals Export API

## Background and Goals

Infinitum should remain an information aggregation product: RSS ingestion, full-text extraction, AI summary, content analysis, tagging, clustering, and feed presentation. A separate keyword/growth tool will consume Infinitum's processed content and perform keyword extraction, SEO enrichment, commercial scoring, page brief generation, and Codex execution workflows.

The goal of this feature is to add a read-only internal export API that gives the external tool enough structured content context to derive keyword candidates without adding keyword research or SEO product logic to Infinitum.

Non-goals:

- Do not add keyword, SEO, CPC, volume, SERP, GSC, or page brief data models to Infinitum.
- Do not add a keyword extraction pipeline inside Infinitum.
- Do not expose this export as a public unauthenticated feed.
- Do not change existing public feed semantics or UI.
- Do not replace existing admin APIs or admin session behavior.

## System Context

Current Infinitum data already contains the useful signal inputs:

- `Item`: original/translated title, RSS excerpt/content, optional full text, summary, language, moderation status, quality score, event signature fields, source, cluster, and tags.
- `ContentCluster`: cluster title, summary, item counts, source counts, score, latest publish time, status, and event signature fields.
- `Tag` and `ItemTag`: canonical content organization tags.
- `Source`: source metadata needed to explain where a signal came from.

The export API should read from existing query/repository layers where practical, but it must preserve the repository constraint that feed time filtering uses `items.createdAt` as ingestion-time semantics rather than `publishedAt`.

## Proposed Design

### Components and Responsibilities

`src/app/api/internal/content-signals/route.ts`

- New API route handler for authenticated read-only export.
- Parses query parameters, enforces authorization, calls a service function, and returns JSON.

`src/lib/content-export/service.ts`

- Owns export-specific orchestration and DTO assembly.
- Applies filters, pagination, full-text truncation rules, and stable ordering.
- Keeps the export contract independent from UI DTOs.

`src/lib/content-export/repository.ts`

- Performs Prisma reads for items, clusters, sources, and tags.
- Avoids direct reuse of public feed DTOs when those DTOs omit fields needed by downstream analysis.

`src/lib/content-export/types.ts`

- Defines request options and response DTOs.
- Serves as the stable contract for tests and future MCP/client integrations.

### API Contract

Endpoint:

```http
GET /api/internal/content-signals
Authorization: Bearer <INTERNAL_API_TOKEN>
```

Query parameters:

| Parameter | Type | Default | Notes |
|---|---:|---:|---|
| `since` | ISO datetime | required for V1 | Lower bound for `items.createdAt`. |
| `until` | ISO datetime | now | Upper bound for `items.createdAt`. |
| `cursor` | string | none | Opaque pagination cursor. |
| `limit` | integer | 100 | Maximum 500. |
| `includeFullText` | boolean | false | Includes truncated `fullText` only when explicitly requested. |
| `fullTextLimit` | integer | 4000 | Maximum characters per item when `includeFullText=true`. |
| `clusterMode` | `linked` or `none` | `linked` | Include clusters referenced by returned items. |
| `status` | `allowed` or `all` | `allowed` | V1 should default to content that passed moderation. |

Response:

```json
{
  "window": {
    "since": "2026-06-29T00:00:00.000Z",
    "until": "2026-06-30T00:00:00.000Z"
  },
  "pagination": {
    "limit": 100,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA2LTI5VDA4OjAwOjAwLjAwMFoiLCJpZCI6Iml0ZW1fMTIzIn0"
  },
  "items": [
    {
      "id": "item_123",
      "sourceId": "source_1",
      "sourceName": "OpenAI Blog",
      "clusterId": "cluster_1",
      "url": "https://example.com/article",
      "title": "Original title",
      "translatedTitle": "Translated title",
      "summary": "AI generated summary",
      "rssExcerpt": "RSS excerpt",
      "fullText": null,
      "language": "en",
      "publishedAt": "2026-06-29T07:00:00.000Z",
      "createdAt": "2026-06-29T08:00:00.000Z",
      "qualityScore": 82,
      "event": {
        "type": "launch",
        "subject": "Example Product",
        "action": "launches",
        "object": "new feature",
        "date": "2026-06-29"
      },
      "tags": ["AI Coding", "Developer Tools"]
    }
  ],
  "clusters": [
    {
      "id": "cluster_1",
      "title": "Cluster title",
      "summary": "Cluster summary",
      "score": 76,
      "itemCount": 6,
      "displayItemCount": 6,
      "displaySourceCount": 4,
      "latestPublishedAt": "2026-06-29T07:00:00.000Z",
      "tags": ["AI Coding", "Developer Tools"],
      "itemIds": ["item_123"]
    }
  ]
}
```

### Filtering and Pagination

- Default export includes only items with `moderationStatus="allowed"` and non-filtered status.
- Use `items.createdAt` for the time window to match ingestion-time semantics.
- Sort by `(createdAt asc, id asc)` for stable incremental sync.
- Cursor should encode the last `(createdAt, id)` pair, not expose implementation details as separate query parameters.
- The API should be idempotent for the same window and cursor as long as underlying content is unchanged.

### Full Text Handling

Default response should not include `fullText`. The downstream keyword tool can usually derive candidates from title, translated title, summary, tags, event fields, and cluster context.

When `includeFullText=true`:

- Return at most `fullTextLimit` characters per item.
- Apply a hard maximum configured by the server.
- Include a `fullTextTruncated: true` flag if the original text was longer.
- Prefer plain text already stored in `Item.fullText`; do not refetch or re-clean remote pages during export.

### Authentication and Authorization

Use a separate internal token, not the browser admin session cookie.

Proposed env var:

```text
INTERNAL_EXPORT_API_TOKEN
```

Rules:

- Require `Authorization: Bearer <token>` on every request.
- Compare tokens using a timing-safe comparison.
- Return `401` for missing/invalid token.
- Do not accept token through query string.
- Do not log the token.
- Keep this endpoint under `/api/internal/*` to distinguish machine access from admin UI routes.

### Error Responses

Use consistent JSON errors:

```json
{
  "error": "Invalid since parameter",
  "code": "INVALID_QUERY"
}
```

Recommended status codes:

- `400`: invalid query parameter, invalid cursor, limit too large.
- `401`: missing or invalid token.
- `500`: unexpected export failure.

### Observability

Log one structured event per request:

- request id
- window
- limit
- item count
- cluster count
- whether full text was included
- duration
- status code

Do not log item full text, authorization headers, or response bodies.

Future metrics:

- export request count
- export error count
- export latency
- exported item count
- full-text export count

## Quality Attributes

Security:

- Token-only machine authentication avoids coupling external tools to admin browser sessions.
- Full text is opt-in and capped.
- Query tokens are disallowed to avoid leaking credentials through logs.

Privacy:

- Export only content already stored by Infinitum.
- Avoid exporting admin-only operational details, model API config, prompt config, task logs, or internal errors.

Performance:

- Default page size should be safe for SQLite and serverless-style route execution.
- Index usage should align with existing `items.createdAt`, moderation, status, and cluster indexes where possible.
- Avoid large cluster fan-out; include only clusters linked to returned items.

Compatibility:

- Existing public feed and admin APIs remain unchanged.
- No schema change is required for V1.
- The response DTO should be versioned implicitly by the route contract; add `/v2` later only for breaking changes.

Reliability:

- Cursor-based pagination allows the external tool to resume sync.
- The API does not trigger ingestion, AI analysis, refetching, reclustering, or cache invalidation.

## Compatibility, Migration, and Rollback

V1 requires no database migration.

Rollout:

1. Add export route, service, repository, types, and tests.
2. Configure `INTERNAL_EXPORT_API_TOKEN` in the deployment environment.
3. Test with a small `since/until` window.
4. Connect the external keyword tool in read-only mode.

Rollback:

- Remove or disable `INTERNAL_EXPORT_API_TOKEN` to block machine access immediately.
- Revert the route/service files if needed.
- No data rollback is required because V1 is read-only.

## Testing and Verification

Unit tests:

- Query parsing: required `since`, invalid dates, invalid cursor, limit bounds.
- Token validation: missing, malformed, invalid, valid.
- Cursor encode/decode.
- Full-text truncation behavior.

Integration tests:

- Authenticated export returns allowed items and linked clusters.
- Unauthenticated export returns `401`.
- Time window uses `createdAt`, not `publishedAt`.
- Pagination is stable across multiple pages.
- `includeFullText=false` omits full text.
- `includeFullText=true` returns capped text and truncation flag.

Manual verification:

```bash
curl -H "Authorization: Bearer $INTERNAL_EXPORT_API_TOKEN" \
  "http://localhost:3000/api/internal/content-signals?since=2026-06-29T00:00:00.000Z&limit=10"
```

## Tradeoffs and Alternatives

Alternative: Add keyword extraction directly to Infinitum.

- Rejected for V1 because it mixes information aggregation with SEO/growth workflow ownership.

Alternative: Reuse public feed API.

- Rejected because public feed DTOs are presentation-oriented and may omit analysis fields, event fields, source evidence, or cluster details needed by the external tool.

Alternative: Export via static JSON file.

- Rejected for V1 because cursor-based API sync is easier to secure, page, and monitor.

Alternative: Use admin session auth.

- Rejected because the external tool is a machine client and should not depend on browser cookie login.

## Open Questions

- Should V1 include filtered items behind `status=all`, or should that be reserved for admin/debug-only clients?
- Should the export include parent aggregation items, child split items, or both?
- What is the initial maximum safe `limit` for production SQLite under current deployment resources?
- Should the external tool receive source group metadata in V1?
- Should there be a webhook after ingestion finishes, or is polling sufficient initially?

## Execution Plan Inputs

Implementation slices:

- Add `content-export` service/repository/types with cursor and DTO tests.
- Add internal token validation helper.
- Add `/api/internal/content-signals` route.
- Add integration tests for authorization, filters, pagination, linked clusters, and full-text options.
- Add deployment documentation for `INTERNAL_EXPORT_API_TOKEN`.

Sequencing constraints:

- Keep the feature read-only in V1.
- Do not modify existing feed query behavior.
- Do not add keyword-specific schema or UI.
- Validate time-window behavior against `createdAt`.

Primary risks:

- Accidentally leaking full text or internal config.
- Confusing `publishedAt` and `createdAt` semantics.
- Returning unstable pagination when new items are ingested during sync.
- Overloading SQLite with large full-text exports.
