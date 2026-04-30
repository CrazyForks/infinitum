---
forge_loop: true
artifact: quick-task
slug: 按建议处理-rss-export-缓存和-post-基础限流
status: done
mode: quick
blocking: false
---

# Quick Task: 按建议处理-rss-export-缓存和-post-基础限流

## Intent

| Field | Value |
| --- | --- |
| Status | done |
| Mode | quick |
| Spike Type | optimization |
| Request | 按建议处理 RSS/export 缓存和 POST 基础限流 |
| Owner | human |
| Created | 2026-04-30 |
| Risk | production |
| Escalation | none |
| Upgrade Summary | N/A |

## Scope

- Extend Cloudflare and Nginx cache coverage to RSS/export public endpoints.
- Add basic Nginx rate limits for login, analytics, and feed cluster/vote paths.

## Out of Scope

- No application code changes.
- No caching for admin/session/vote mutating semantics.

## Acceptance

- RSS/export public endpoints return `MISS` then `HIT` at Cloudflare/Nginx.
- Admin/session/vote paths stay `DYNAMIC`/`BYPASS`.
- Nginx rate limiting returns 429 under burst on a safe login HEAD probe.

| Field | Value |
| --- | --- |
| Loop Type | curl / CLI |
| Command | `curl -I`, Cloudflare Rulesets API, `nginx -t`, direct-origin Nginx probes |
| Failure Signal | Public RSS/export stays `DYNAMIC`, private paths become cached, or rate limit config fails `nginx -t` |
| Determinism | deterministic |
| Re-run Plan | Repeat public and direct-origin header checks |

| Field | Value |
| --- | --- |
| Repro Steps | Request RSS/export endpoints twice through Cloudflare and direct origin |
| Observed Failure | Before the change, RSS/export were not included in custom Cloudflare/Nginx cache rules |
| Expected Behavior | Public RSS/export endpoints cache at edge/origin, while private and mutating endpoints bypass |
| Root Cause | Prior cache rules only covered `/`, `/daily`, `/api/feed`, and `/_next/static/` |
| Fix Hypothesis | Extend cache path allowlist and add targeted Nginx `limit_req` zones keyed by `CF-Connecting-IP` fallback to `$binary_remote_addr` |
| Regression Validation | RSS/export returned `MISS` then `HIT`; admin/session/vote stayed bypass; login HEAD burst returned 429 |
| Failed Hypotheses | 1: adding `/api/daily/` prefix caused `/api/daily` to 301; fixed by adding exact `location = /api/daily` bypass |
| Handoff | Delete `/tmp/cloudflare-token` when no more Cloudflare changes are needed |

| Area | Finding |
| --- | --- |
| Module Map | Cloudflare Cache Rules front `infinitum.shawnxie.top`; Nginx vhost proxies to app on `127.0.0.1:3001`; public endpoints carry app cache headers |
| Architecture Candidates | Keep explicit public-path allowlist; keep all admin/session/vote writes out of cache; use Nginx rate limit as origin protection |
| Issue Triage | N/A |
| Out Of Scope Match | N/A |

## Files Likely Touched

- Cloudflare ruleset `ba71775c44d54e9986c9ca3dcbd47ffb`
- `/www/server/panel/vhost/nginx/0.infinitum_limit_req.conf`
- `/www/server/panel/vhost/nginx/152.32.230.86.conf`
- `tasks/quick/按建议处理-rss-export-缓存和-post-基础限流.md`

## Execution

- Update Cloudflare cache allowlist for RSS/export.
- Add Nginx RSS/export microcache locations.
- Add Nginx rate limit zones and targeted locations.
- Validate public cache status, private bypass status, `/api/daily` regression, and rate limit behavior.

### Changed Files

| File | Change |
| --- | --- |
| Cloudflare ruleset `ba71775c44d54e9986c9ca3dcbd47ffb` | Cache rule now includes `/api/feed/rss`, `/api/daily/rss`, and `/api/daily/*/export.md` |
| `/www/server/panel/vhost/nginx/0.infinitum_limit_req.conf` | Added `CF-Connecting-IP` aware limit key and login/vote/analytics rate zones |
| `/www/server/panel/vhost/nginx/152.32.230.86.conf` | Added RSS/export cache locations, exact `/api/daily` bypass, and rate-limited write locations |
| `tasks/quick/按建议处理-rss-export-缓存和-post-基础限流.md` | Recorded production change evidence |

### Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| Cloudflare Rulesets API `PUT /zones/e421bb9949b3a85cb792d7afbb74a67b/rulesets/ba71775c44d54e9986c9ca3dcbd47ffb` | pass | Updated public cache rule; new public rule id `9e48a5e3a6d04d81a2c39a155a865f4c` |
| `nginx -t` after Nginx config edits | pass | Config syntax OK before reload |
| Direct-origin `curl -I /api/feed/rss` and `/api/daily/rss` twice | pass | Both returned `X-Proxy-Cache: MISS` then `HIT` |
| Public `curl -D - /api/feed/rss` and `/api/daily/rss` twice | pass | Both returned `cf-cache-status: MISS` then `HIT` |
| Public/direct `curl -D - /api/daily/2026-04-29/export.md` twice | pass | Cloudflare returned `MISS` then `HIT`; Nginx returned `MISS` then `HIT` |
| Public `curl -D - /admin`, `/api/admin/session`, `/api/feed/clusters/test/vote` | pass | Stayed `cf-cache-status: DYNAMIC` and `x-proxy-cache: BYPASS`; vote path still sets `visitorId` |
| Direct-origin burst `HEAD /api/admin/login` | pass | Returned 405 for allowed burst then 429 for excess requests, proving Nginx rate limiting is active |
| Public/direct `/api/daily` check after exact bypass fix | pass | Returned 200 JSON and `X-Proxy-Cache: BYPASS` instead of 301 |

## Result

done

## Follow-ups

- Delete `/tmp/cloudflare-token` if no further Cloudflare API changes are needed.

## Open Questions

| Question | Owner | Blocking | Resolution |
| --- | --- | --- | --- |
| N/A | N/A | no | N/A |

## Assumptions

- `CF-Connecting-IP` is available for normal Cloudflare traffic; direct-origin requests fall back to `$binary_remote_addr`.
- `/api/daily/*` public API prefix is only used for published export responses today; exact `/api/daily` remains dynamic bypass for list hydration.

## Risks

- Nginx rate limits are intentionally conservative; very large bursts from the same visitor IP may receive 429 on login/vote/analytics paths.

## Validation

- Completion claim is based on the fresh command results in Commands Run.
