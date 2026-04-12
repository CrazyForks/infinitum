# Source Import And Feed Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OPML import, RSS metadata auto-fill, and feed filtering by group/source with cluster-to-single fallback after filtering.

**Architecture:** Keep all persistence logic in the existing settings service and extend the feed repository so item-level filtering produces the final display model. Reuse `rss-parser` for metadata lookup, add small admin routes for metadata preview and OPML import, and update the admin/frontpage client components to drive the new APIs without changing the existing ingestion pipeline.

**Tech Stack:** Next.js App Router 16, TypeScript, Prisma + SQLite, React 19, Vitest

---

### Task 1: Add failing tests for settings import and feed filtering

**Files:**
- Modify: `tests/integration/admin-settings-service.test.ts`
- Modify: `tests/integration/feed-api.test.ts`
- Modify: `tests/components/admin-settings-panel.test.tsx`
- Modify: `tests/components/feed-panel.test.tsx`

- [ ] Add a failing service test that imports OPML text with two categorized feeds and expects one `SourceGroup` per category plus sources assigned by `rssUrl`.
- [ ] Add a failing service test that imports an OPML entry whose `rssUrl` already exists and expects the source record to be updated instead of duplicated.
- [ ] Add a failing service test for RSS metadata resolution that expects `name` and `siteUrl` to be filled from feed metadata, then a second case that falls back to hostname/root URL when metadata fields are missing.
- [ ] Add failing `/api/feed` tests that pass `groupId` and `sourceId`, expect only matching entries, and assert that a filtered cluster with one remaining item is returned as `type: "single"`.
- [ ] Add a failing admin settings panel test that clicks the RSS auto-fill button, verifies the metadata endpoint request, and expects the name/site URL inputs to be updated.
- [ ] Add a failing feed panel test that changes group/source filters and verifies the component requests `/api/feed` with the preserved range/sort/date query parameters.
- [ ] Run `npm run test -- tests/integration/admin-settings-service.test.ts tests/integration/feed-api.test.ts tests/components/admin-settings-panel.test.tsx tests/components/feed-panel.test.tsx` and confirm the new expectations fail for the intended missing-feature reasons.

### Task 2: Implement RSS metadata resolution and OPML import in the settings service

**Files:**
- Modify: `src/lib/settings/service.ts`
- Modify: `src/lib/settings/types.ts`
- Modify: `src/lib/ingestion/parser.ts`
- Modify: `src/lib/ingestion/types.ts` if parser typing needs a metadata return shape
- Modify: `tests/integration/admin-settings-service.test.ts`

- [ ] Add a small RSS metadata helper that accepts `rssUrl`, uses `rss-parser` to parse the feed, and returns normalized `{ name, rssUrl, siteUrl }` with hostname/root URL fallback logic.
- [ ] Add OPML parsing helpers that walk nested `outline` nodes, collect entries with `xmlUrl`, carry the nearest parent category name, and normalize `title`/`text`/`htmlUrl` fields.
- [ ] Add service functions for `resolveSourceMetadata(rssUrl)` and `importSourcesFromOpml(opmlText)` that keep database writes inside `src/lib/settings/service.ts`.
- [ ] Implement import persistence using existing `SourceGroup` and `Source` tables: create missing groups by name, upsert sources by `rssUrl`, default imported rows to `enabled: true` and `fetchFullTextWhenMissing: true`, and return an import summary with created/updated/failed counts.
- [ ] Make the new helpers injectable or parameterized enough for tests to stub parser results instead of performing network requests.
- [ ] Re-run `npm run test -- tests/integration/admin-settings-service.test.ts` and confirm the previously failing service tests now pass.

### Task 3: Add admin routes for RSS preview and OPML import

**Files:**
- Create: `src/app/api/admin/settings/sources/resolve/route.ts`
- Create: `src/app/api/admin/settings/sources/import/route.ts`
- Modify: `src/app/api/admin/settings/sources/route.ts` only if shared validation should be extracted
- Modify: `src/lib/admin/http.ts` only if a new error-to-status mapping is needed
- Add or modify tests adjacent to existing admin settings API coverage if route-specific assertions are needed

- [ ] Add a `POST /api/admin/settings/sources/resolve` route that requires admin access, validates `rssUrl`, calls `resolveSourceMetadata`, and returns `{ source }` or a readable error payload.
- [ ] Add a `POST /api/admin/settings/sources/import` route that requires admin access, accepts OPML text from JSON or multipart form data, calls `importSourcesFromOpml`, and returns the import summary.
- [ ] Keep route handlers aligned with Next.js App Router route handler conventions already used in the project: native `Request`, `Response.json`, and `RouteContext` only where dynamic params exist.
- [ ] Add route-level tests only if the service tests do not fully cover validation and status-code behavior; otherwise keep route logic thin and reuse service coverage.
- [ ] Run the targeted route and settings API tests that cover these endpoints and confirm green status before moving on.

### Task 4: Update the admin settings page for auto-fill and OPML import

**Files:**
- Modify: `src/components/admin/admin-settings-panel.tsx`
- Modify: `src/components/admin/admin.module.css`
- Modify: `tests/components/admin-settings-panel.test.tsx`
- Modify: `src/lib/settings/types.ts` if the admin snapshot needs extra display data for filter options or import messaging

- [ ] Extend the new-source form state with import-related UI state: selected OPML file, auto-fill pending state, and import result message.
- [ ] Add a “根据 RSS 自动填充” button beside the create-source fields; on click call `/api/admin/settings/sources/resolve`, then populate `name` and `siteUrl` while leaving `rssUrl`, `groupId`, and booleans untouched.
- [ ] Add an OPML upload control and import button in the information-source section; submit the file contents to `/api/admin/settings/sources/import`, display the returned summary, and refresh the page after a successful import.
- [ ] Preserve existing create/update/delete behavior for groups and sources, and ensure pending state prevents duplicate submissions.
- [ ] Update styles in `src/components/admin/admin.module.css` only as needed to fit the new controls into the current admin layout without altering unrelated sections.
- [ ] Re-run `npm run test -- tests/components/admin-settings-panel.test.tsx` and verify the new interaction tests pass.

### Task 5: Implement feed filtering, cluster subset rendering, and UI controls

**Files:**
- Modify: `src/lib/feed/types.ts`
- Modify: `src/lib/feed/range.ts`
- Modify: `src/lib/feed/repository.ts`
- Modify: `src/app/api/feed/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/feed/feed-panel.tsx`
- Modify: `src/components/feed/feed-panel.module.css`
- Modify: `tests/integration/feed-api.test.ts`
- Modify: `tests/components/feed-panel.test.tsx`

- [ ] Extend feed filter types to include `groupId` and `sourceId`, and keep query normalization centralized with the existing range/sort/date parsing helpers.
- [ ] Update `listFeedItems` so it filters displayable `Item` records by date/group/source first, groups the matching rows by `clusterId`, rebuilds entry DTOs from the filtered subset, and sorts the final entries by the same display fields the UI shows.
- [ ] Ensure filtered cluster entries recompute `latestPublishedAt`, `sourceCount`, `itemCount`, preview items, and `hasMoreItems` from the matching subset only.
- [ ] Ensure a cluster with exactly one matching item maps to the existing single-entry DTO shape so the UI naturally renders the single-card layout.
- [ ] Update `/api/feed` and `src/app/page.tsx` to read the new query parameters and pass them through on initial server render.
- [ ] Extend `FeedPanel` state, query construction, and controls to support group/source selects, preserve current date and sort filters during changes, and reset the source selection when the chosen group no longer contains the selected source.
- [ ] Update the cluster expansion fetch path if needed so expanded items remain consistent with the active filter semantics; if expansion stays unfiltered, document and change it now so it only returns the filtered subset.
- [ ] Add only the minimal CSS needed to fit the new selectors into the existing control bar on desktop and mobile.
- [ ] Re-run `npm run test -- tests/integration/feed-api.test.ts tests/components/feed-panel.test.tsx` and confirm both filtering and cluster fallback behavior pass.

### Task 6: Final regression verification

**Files:**
- No intentional source edits; use this task only to verify and fix any discovered regressions

- [ ] Run `npm test` and fix any regressions until the full suite is green.
- [ ] Run `npm run lint` and fix any lint errors introduced by the changes.
- [ ] Run `npm run build` and fix any Next.js typing or route-handler issues, especially around the new admin routes and page search params.
- [ ] Manually sanity-check the main user flows if build and tests pass: admin source auto-fill, OPML import summary, homepage group/source filtering, and cluster-to-single fallback.

