---
forge_loop: true
artifact: review-report
slug: public-feed-cache-and-html-cache
status: done
gate: H4
blocking: false
must_fix_count: 0
security_high_risk: false
failed_tests_unexplained: false
---

# Review Report: public-feed-cache-and-html-cache

| Field | Value |
| --- | --- |
| Status | done |
| Reviewer | Codex |
| Recommendation | Approve with Follow-ups |
| Must Fix Count | 0 |
| Security High Risk | no |
| Failed Tests Unexplained | no |
| Review Scope | current diff: public feed shared cache, PV/UV realtime downgrade, public homepage/daily admin hydration, cache headers, quick task records |
| Review Depth | standard |
| Specialist Reviewers | security and deployability checklist |
| Adversarial Pass | N/A |
| Retrospective | skipped: quick iteration with focused implementation |

## Requirement Compliance

| Requirement / AC | Result | Notes |
| --- | --- | --- |
| Improve anonymous visitor capacity | pass | Public feed no longer creates/uses visitor cookie; `/api/feed`, `/`, and `/daily` expose shared-cache headers. |
| Preserve vote dedupe semantics | pass | Vote POST path still owns visitor cookie and database unique vote semantics; feed list only drops historical per-user highlight. |
| Reduce PV/UV cost | pass | Same visitor/path writes are deduped for a short window and stats are cached. |
| Keep admin capabilities reachable | pass | Homepage and daily list hydrate admin state from `/api/admin/session`; daily list reloads admin-visible data from `/api/daily`. |

## Design Compliance

| Area | Result | Notes |
| --- | --- | --- |
| Cache semantics | pass | Anonymous feed is shared; admin/private functionality remains behind client hydration or admin APIs. |
| Freshness | pass | Feed cache key still includes fetch/item versioning; edge cache is short TTL. |
| Admin safety | pass | `/daily/[date]` remains dynamic to avoid caching draft detail/refinement behavior. |
| Production deployability | pass with follow-up | Code-level headers are present; production Nginx/Cloudflare must be configured after redeploy to honor them. |

## Contract Compliance

| Area | Result | Notes |
| --- | --- | --- |
| API | pass | `/api/feed` response shape unchanged; header behavior changed intentionally. |
| Types | pass | New optional props are backward compatible. |
| Auth | pass | Admin state check continues through existing `/api/admin/session`; no permission broadening. |
| Data | pass | No schema or migration changes. |

## Code Quality

- No Must Fix findings.
- Client admin hydration is opt-in, so existing component tests and admin pages are not forced to make extra session requests.
- Daily admin list data is only refetched after client confirms admin session.
- Analytics cache is process-local; acceptable for short-term load shedding, not a global exact counter.

## Commit Readiness

| Check | Result | Notes |
| --- | --- | --- |
| Obvious Bugs | pass | Reviewed cache key removal, admin hydration guards, analytics dedupe, and response headers. |
| API / Data Breakage | pass | No route removal or schema change. |
| Security | pass | Admin-only data is still loaded through admin-aware API after session confirmation; daily detail remains dynamic. |
| Test Coverage | pass | Targeted feed, analytics, shell/header, and feed panel tests passed. |
| Deployability | pass with advisory | Existing production image still needs redeploy before new app headers exist; Nginx/Cloudflare setup follows redeploy. |
| Error Handling UX | pass | Admin hydration failures fail closed to non-admin UI or show daily admin load feedback. |
| Resource Cleanup | pass | Client hydration effects use active flags to avoid state updates after unmount. |
| Dependency Change | N/A | No manifest or lockfile changes. |

## Autofix Routing

| Class | Count | Action |
| --- | --- | --- |
| safe_auto | 0 | N/A |
| gated_auto | 0 | N/A |
| manual | 0 | N/A |
| advisory | 2 | Configure production edge cache after redeploy; consider vote-status hydration later only if needed. |

## Follow-ups

| Type | Item | Target | Notes |
| --- | --- | --- | --- |
| deploy | Rebuild/redeploy app image before Nginx/Cloudflare cache tuning | production | Current server still returns old `no-store` headers until redeployed. |
| ops | Configure Nginx/Cloudflare to respect `s-maxage` and bypass admin/private requests | production | Avoid caching `/admin/*`, mutating methods, or admin-cookie responses. |

## Security Review

- Pass. No new secret exposure, no permission broadening, no public access to admin APIs. The main cache risk is operational: production edge cache must bypass admin/private routes and cookies.

## Performance Review

- Pass. The change reduces per-visitor feed cache fragmentation, allows public GET edge caching, and lowers pageview write/query amplification.

## Test Coverage

- `npx tsc --noEmit` passed.
- `npx vitest run tests/components/global-header.test.tsx tests/components/page-shell.test.tsx tests/components/feed-panel.test.tsx tests/integration/feed-api.test.ts tests/integration/analytics-api.test.ts` passed: 5 files, 81 tests.
- `npm run lint` passed with 0 errors and one existing warning: `src/components/admin/admin-page-client.tsx:133` unused `_props`.
- `npm run build` passed.
- `npx @shawnxie666/forge-loop validate` passed for implementation quick task artifacts.

## Must Fix

| Finding | Impact | Owner |
| --- | --- | --- |
| N/A | N/A | N/A |

## Should Fix

- N/A

## Nice To Have

- Add lightweight vote-status hydration later if the product wants historical vote button highlight after refresh, without putting visitorId back into feed list cache keys.

## Final Recommendation

Approve with Follow-ups. The diff is coherent and ready to commit. No Must Fix, security high-risk issue, or unexplained test failure was found.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- Anonymous public traffic is the primary load concern.
- Admin controls can appear after client session hydration.
- PV/UV can be near-real-time rather than exact per-hit realtime.

## Risks

- Production edge caching must be configured carefully to avoid caching admin/private responses.
- Until redeploy, the server still runs the previous image and will not emit the new app-level cache headers.

## Validation

- No Must Fix before commit.
- No Security High Risk before commit.
- No unexplained test failure before commit.
