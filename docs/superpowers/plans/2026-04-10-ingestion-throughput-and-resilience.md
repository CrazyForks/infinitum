# Ingestion Throughput And Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve ingestion throughput and robustness by adding bounded parallelism, combining AI enrichment into one request, making manual ingestion asynchronous, and degrading gracefully when enrichment fails.

**Architecture:** Keep the current single-process Next.js ingestion pipeline, but split item processing into a reusable worker that can run under a configurable concurrency limit. Replace separate translate/summarize AI calls with one enrichment method returning both fields, persist run counters during execution so the UI can poll progress, and treat enrichment failures as fallback-worthy processed items instead of hard failures.

**Tech Stack:** Next.js App Router, TypeScript, Prisma + SQLite, Vitest

---

### Task 1: Add failing ingestion and provider tests

**Files:**
- Modify: `tests/integration/ingestion-service.test.ts`
- Modify: `tests/unit/ai-provider.test.ts`
- Modify: `tests/components/feed-panel.test.tsx`
- Create: `tests/integration/ingest-api.test.ts`

- [ ] Add tests for bounded concurrency, combined AI enrichment, degraded processed items, async run API, and polling UI behavior.
- [ ] Run the targeted tests first and confirm they fail for the expected reasons.

### Task 2: Implement bounded concurrency and graceful degradation

**Files:**
- Modify: `src/lib/ingestion/service.ts`
- Modify: `src/lib/ingestion/types.ts`
- Modify: `src/lib/feed/repository.ts`
- Modify: `src/lib/feed/types.ts`

- [ ] Refactor item processing to return richer run metrics while preserving dedupe/filter behavior.
- [ ] Add a small internal concurrency runner and update fetch run counters during execution.
- [ ] Change fallback behavior so article fetch and AI enrichment failures still store processed items when displayable content exists.

### Task 3: Merge AI translation and summary generation into one call

**Files:**
- Modify: `src/lib/ai/provider.ts`
- Modify: `tests/unit/ai-provider.test.ts`

- [ ] Replace separate translate/summarize calls with a single enrichment call that returns both fields.
- [ ] Keep compatibility fallback behavior when no API key is configured or the provider returns malformed content.

### Task 4: Make manual ingestion async and expose progress

**Files:**
- Modify: `src/app/api/ingest/run/route.ts`
- Modify: `src/app/api/ingest/status/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/feed/feed-panel.tsx`

- [ ] Return immediately from the manual run endpoint after starting a background run.
- [ ] Extend the status payload with live counters and update the page to poll while a run is active.
- [ ] Refresh the current feed range automatically after completion.

### Task 5: Verify end to end

**Files:**
- Modify: `config/infinitum.config.json` only if schema additions are required

- [ ] Run targeted tests, then full `npm test`, `npm run lint`, and `npm run build`.
- [ ] Rebuild and run the local container, trigger a manual ingestion, and verify progress polling plus successful feed refresh via API.
