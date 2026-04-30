# Nginx 与 Cloudflare 性能优化策略

本文沉淀 Infinitum 已验证过的边缘缓存、源站反代缓存和基础限流策略。目标是让后续项目可以复用判断方法和配置模板，而不是直接复制所有路径。

最后验证日期：2026-04-30。

## 目标

- 匿名读流量优先命中 Cloudflare，其次命中 Nginx origin shield，最后才进入应用。
- 只缓存明确公开、匿名、GET/HEAD 的响应。
- admin、session、login、vote、写接口和任何会 `Set-Cookie` 的路径必须绕过共享缓存。
- 由应用层决定数据新鲜度，Cloudflare/Nginx 尽量尊重源站 `Cache-Control` / `s-maxage`。
- 对缓存挡不住的 POST/写路径加低成本限流，避免异常突发直接打穿应用和数据库。

## 分层模型

| 层级 | 责任 | 常见 TTL |
| --- | --- | --- |
| App | 判断响应是否公开，并输出 `Cache-Control` | 按业务路径决定 |
| Nginx | 源站保护、微缓存、限流、正确转发 Host/协议头 | 动态公开读一般 30s 到 300s |
| Cloudflare | 全球边缘缓存、第一层 cache/bypass 判断 | Honor origin `s-maxage` |

不要因为某个 URL 访问量大就缓存它。先确认响应是匿名的、没有 `Set-Cookie`、不依赖 admin/session cookie，再进入共享缓存。

## 应用层前提

公开可缓存响应应输出类似：

```http
Cache-Control: public, s-maxage=30, stale-while-revalidate=300
```

低频归档类接口可以更长：

```http
Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```

开启边缘/反代缓存前必须检查：

- 路由不会为了匿名内容读取 session/auth。
- 路由不会设置 visitor/admin cookie。
- 响应不包含用户态数据，例如投票高亮、未读状态、admin 操作按钮。
- 写操作和公开 GET/HEAD 路由已经分离。
- 如果框架会用请求头生成变体，要么把相关头纳入 Nginx cache key，要么把这类变体请求排除在共享缓存外。

Next.js RSC 请求需要额外小心。除非你专门设计了 RSC 相关 header 的缓存键，否则不要在 Cloudflare 缓存 `_rsc` 页面变体。Infinitum 当前排除了 query 中包含 `_rsc=` 的页面请求。

## Cloudflare Cache Rules

建议使用 Cloudflare Cache Rules / Rulesets API。规则顺序上，先写 bypass，再写 public allowlist cache。

### Bypass 规则

绕过私有、写入、会设置 cookie 的路径：

```text
(http.host eq "example.com" and (
  http.request.method ne "GET" and http.request.method ne "HEAD" or
  starts_with(http.request.uri.path, "/admin") or
  starts_with(http.request.uri.path, "/login") or
  starts_with(http.request.uri.path, "/api/admin") or
  starts_with(http.request.uri.path, "/api/feed/clusters/")
))
```

动作：

```json
{
  "cache": false
}
```

### Cache 规则

只允许已确认公开的路径进入缓存：

```text
(http.host eq "example.com" and
  (http.request.method eq "GET" or http.request.method eq "HEAD") and
  (
    (http.request.uri.path eq "/" and not http.request.uri.query contains "_rsc=") or
    (http.request.uri.path eq "/daily" and not http.request.uri.query contains "_rsc=") or
    http.request.uri.path eq "/api/feed" or
    http.request.uri.path eq "/api/feed/rss" or
    http.request.uri.path eq "/api/daily/rss" or
    (starts_with(http.request.uri.path, "/api/daily/") and ends_with(http.request.uri.path, "/export.md")) or
    starts_with(http.request.uri.path, "/_next/static/")
  )
)
```

动作：

```json
{
  "cache": true,
  "edge_ttl": { "mode": "bypass_by_default" },
  "browser_ttl": { "mode": "respect_origin" }
}
```

这表示：Cloudflare 可以缓存这些响应，但 TTL 仍由源站 `Cache-Control` 决定。对 Free 计划和多数动态站点来说，这比手工设计复杂 cache key 更稳。

### API 操作流程

使用最小权限 API Token：

- `Zone -> Zone -> Read`
- `Zone -> Cache Rules -> Edit`

推荐临时 token 传递方式：

```bash
printf '%s' '<token>' > /tmp/cloudflare-token
chmod 600 /tmp/cloudflare-token
```

不要提交 token，用完删除：

```bash
rm -f /tmp/cloudflare-token
```

常用 API：

```bash
TOKEN="$(tr -d '\r\n' < /tmp/cloudflare-token)"
API="https://api.cloudflare.com/client/v4"

curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/zones?name=example.com&status=active"

curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/zones/${ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint"
```

新建 ruleset 使用 `POST /zones/{zone_id}/rulesets`；更新现有 ruleset 使用 `PUT /zones/{zone_id}/rulesets/{ruleset_id}`。

官方文档：

- Cloudflare Cache Rules API: https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/
- Cloudflare Rulesets API: https://developers.cloudflare.com/api/resources/rulesets/
- Cloudflare Cache Rules settings: https://developers.cloudflare.com/cache/how-to/cache-rules/settings/

## Nginx Origin Shield

Nginx 应转发真实 Host 和原始协议/主机信息：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Port $server_port;
```

不要写死 `proxy_set_header Host 127.0.0.1;`。这会影响应用生成 canonical URL、解析 public origin，也会降低缓存键的可解释性。

### 缓存区

每个站点定义独立 cache zone：

```nginx
proxy_cache_path /www/wwwroot/example.com/proxy_cache_dir
  levels=1:2
  keys_zone=example_cache:20m
  inactive=1d
  max_size=5g;
```

### 公开动态微缓存

公开 HTML/API 尽量用精确 location：

```nginx
location = /api/feed {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;

    proxy_cache example_cache;
    proxy_cache_key "$scheme$request_method$host$request_uri|rsc:$http_rsc|accept:$http_accept|nrst:$http_next_router_state_tree|nrp:$http_next_router_prefetch|nrsp:$http_next_router_segment_prefetch";
    proxy_cache_valid 200 30s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    proxy_cache_bypass $http_authorization;
    proxy_no_cache $http_authorization $upstream_http_set_cookie;

    add_header X-Proxy-Cache $upstream_cache_status always;
}
```

RSS/export 这类公开归档接口：

```nginx
location = /api/feed/rss {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;

    proxy_cache example_cache;
    proxy_cache_key "$scheme$request_method$host$request_uri|accept:$http_accept";
    proxy_cache_valid 200 300s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    proxy_no_cache $upstream_http_set_cookie;

    add_header X-Proxy-Cache $upstream_cache_status always;
}
```

构建产物静态资源：

```nginx
location ^~ /_next/static/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;

    proxy_cache example_cache;
    proxy_cache_key "$scheme$request_method$host$request_uri|accept:$http_accept";
    proxy_cache_valid 200 30d;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    proxy_no_cache $upstream_http_set_cookie;

    add_header X-Proxy-Cache $upstream_cache_status always;
}
```

兜底 location 不缓存：

```nginx
location ^~ / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_cache off;
    add_header X-Proxy-Cache BYPASS always;
}
```

如果新增了 `location ^~ /api/daily/` 这类前缀 location，而应用也存在无尾斜杠路由 `/api/daily`，要额外加精确 `location = /api/daily`。否则 Nginx 可能把 `/api/daily` 自动 301 到 `/api/daily/`。

官方文档：

- Nginx proxy module: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Nginx limit req module: https://nginx.org/en/docs/http/ngx_http_limit_req_module.html

## 限流

Cloudflare 缓存挡不住 POST/写路径。源站 Nginx 应对容易被刷的接口加基础限流。

Cloudflare 后面优先使用 `CF-Connecting-IP`，直连源站时 fallback 到 `$binary_remote_addr`：

```nginx
map $http_cf_connecting_ip $app_limit_key {
    "" $binary_remote_addr;
    default $http_cf_connecting_ip;
}

limit_req_zone $app_limit_key zone=app_login:10m rate=1r/s;
limit_req_zone $app_limit_key zone=app_vote:10m rate=10r/s;
limit_req_zone $app_limit_key zone=app_analytics:10m rate=20r/s;
```

只在需要保护的路径上启用：

```nginx
location = /api/admin/login {
    limit_req zone=app_login burst=5 nodelay;
    limit_req_status 429;

    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_cache off;
    add_header X-Proxy-Cache BYPASS always;
}

location = /api/track-page-view {
    limit_req zone=app_analytics burst=60 nodelay;
    limit_req_status 429;

    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_cache off;
    add_header X-Proxy-Cache BYPASS always;
}

location ^~ /api/feed/clusters/ {
    limit_req zone=app_vote burst=30 nodelay;
    limit_req_status 429;

    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_cache off;
    add_header X-Proxy-Cache BYPASS always;
}
```

限流值要根据真实访问调整。起步可以保守一些，先挡异常 burst，但不要低到让同办公室、学校、运营商 NAT 下的正常用户频繁 429。

## 验证清单

先绕过 Cloudflare，在源站 Nginx 上验证：

```bash
for u in / /api/feed /daily /api/feed/rss /api/daily/rss; do
  echo "=== $u first"
  curl -sS -I -H "Host: example.com" "http://127.0.0.1$u"
  echo "=== $u second"
  curl -sS -I -H "Host: example.com" "http://127.0.0.1$u"
done
```

期望结果：

- 公开路径：第一次 `X-Proxy-Cache: MISS`，第二次 `X-Proxy-Cache: HIT`。
- 私有路径：始终 `X-Proxy-Cache: BYPASS`。

再验证 Cloudflare 公网响应：

```bash
for u in https://example.com/ https://example.com/api/feed https://example.com/daily; do
  echo "=== $u first"
  curl -sS -D - -o /dev/null "$u" | awk 'BEGIN{IGNORECASE=1} /^HTTP\// || /^cache-control:/ || /^cf-cache-status:/ || /^age:/ || /^x-proxy-cache:/ || /^set-cookie:/ {print}'
  sleep 2
  echo "=== $u second"
  curl -sS -D - -o /dev/null "$u" | awk 'BEGIN{IGNORECASE=1} /^HTTP\// || /^cache-control:/ || /^cf-cache-status:/ || /^age:/ || /^x-proxy-cache:/ || /^set-cookie:/ {print}'
done
```

期望结果：

- 公开可缓存路径：`cf-cache-status: MISS` 后变 `HIT`。
- admin/session/vote 路径：`cf-cache-status: DYNAMIC`，`X-Proxy-Cache: BYPASS`。
- 会 `Set-Cookie` 的路径不能被缓存。

每次 reload 前必须：

```bash
nginx -t && nginx -s reload
```

限流可以用无副作用方法验证，例如对 login 做 HEAD 连发，超过 burst 后应出现 429：

```bash
for i in $(seq 1 10); do
  curl -sS -o /dev/null -w "%{http_code}\n" -I -H "Host: example.com" http://127.0.0.1/api/admin/login
done
```

## 常见坑

- 缓存带 `Set-Cookie` 的响应。
- 因为 admin/session 接口返回 200 就误缓存。
- 忘记 `proxy_set_header Host $host`，导致应用生成 `127.0.0.1` 相关 URL。
- 新增 prefix location 后，让无尾斜杠接口被 Nginx 自动 301。
- 缓存框架变体请求，却没有把变体 header 纳入 cache key。
- 以为源站有 `s-maxage`，Cloudflare 就一定会缓存 HTML/API；很多情况下还需要 Cache Rule。
- 只验证 Cloudflare HIT，不验证私有路径是否 bypass。

## Infinitum 参考值

Infinitum 当前配置：

| Path | Cloudflare | Nginx | 说明 |
| --- | --- | --- | --- |
| `/` | cache eligible | 30s microcache | Cloudflare 排除 `_rsc` |
| `/api/feed` | cache eligible | 30s microcache | 匿名公开 feed |
| `/daily` | cache eligible | 300s microcache | 公开日报列表页 |
| `/api/feed/rss` | cache eligible | 300s microcache | RSS |
| `/api/daily/rss` | cache eligible | 300s microcache | RSS |
| `/api/daily/*/export.md` | cache eligible | 300s microcache | 已发布日报 markdown 导出 |
| `/_next/static/*` | cache eligible | 30d Nginx cache | immutable 构建资源 |
| `/admin*`、`/login*`、`/api/admin*` | bypass | bypass | 私有/admin |
| `/api/feed/clusters/*` | bypass | bypass + rate limit | 投票/详情路径可能设置 `visitorId` |
| `/api/track-page-view` | bypass | bypass + rate limit | 写路径 |

Infinitum 当前限流：

| Path | Zone | Rate | Burst |
| --- | --- | --- | --- |
| `/api/admin/login` | `infinitum_login` | `1r/s` | `5` |
| `/api/feed/clusters/*` | `infinitum_vote` | `10r/s` | `30` |
| `/api/track-page-view` | `infinitum_analytics` | `20r/s` | `60` |
