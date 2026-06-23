/**
 * Public origin resolution.
 *
 * Single source of truth: `resolveOriginFromHeaders(headers)`.
 * Resolution order:
 *   1. Explicit env: SITE_URL / NEXT_PUBLIC_SITE_URL / PUBLIC_SITE_URL
 *   2. Platform-provided env: Vercel / Netlify / Cloudflare Pages / Railway / Render
 *   3. Request headers: X-Forwarded-Host, Host, X-Forwarded-Proto
 *   4. Fallback: http://localhost:3000
 *
 * `resolveSiteOrigin()` and `resolvePublicOrigin(request)` are thin wrappers
 * around the same core, so behavior is consistent regardless of caller context.
 */

const PUBLIC_SITE_URL_ENV_KEYS = [
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PUBLIC_SITE_URL",
] as const;

const PLATFORM_ORIGIN_ENV_KEYS = [
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "URL",
  "DEPLOY_PRIME_URL",
  "DEPLOY_URL",
  "CF_PAGES_URL",
  "RAILWAY_PUBLIC_DOMAIN",
  "RENDER_EXTERNAL_URL",
] as const;

const LOCAL_SITE_ORIGIN = "http://localhost:3000";

type HeaderRecord = Headers | Record<string, string | string[] | undefined>;

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function readHeader(headers: HeaderRecord, name: string): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeOrigin(value: string | null | undefined) {
  const rawValue = value?.trim();
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue);
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeHost(value: string | null | undefined) {
  const host = firstHeaderValue(value ?? null);
  if (!host || /[\s/\\]/.test(host)) {
    return null;
  }

  return host;
}

function normalizeProtocol(value: string | null | undefined) {
  const protocol = firstHeaderValue(value ?? null)?.replace(/:$/, "").toLowerCase();
  return protocol === "http" || protocol === "https" ? protocol : null;
}

function readConfiguredOrigin(): string | null {
  for (const key of PUBLIC_SITE_URL_ENV_KEYS) {
    const origin = normalizeOrigin(process.env[key]);
    if (origin) {
      return origin;
    }
  }
  return null;
}

function readPlatformOrigin(): string | null {
  for (const key of PLATFORM_ORIGIN_ENV_KEYS) {
    const raw = process.env[key]?.trim();
    if (!raw) {
      continue;
    }

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const origin = normalizeOrigin(raw);
      if (origin) {
        return origin;
      }
      continue;
    }

    const origin = normalizeOrigin(`https://${raw}`);
    if (origin) {
      return origin;
    }
  }
  return null;
}

function readHeaderOrigin(headers: HeaderRecord | null | undefined): string | null {
  if (!headers) {
    return null;
  }

  const forwardedHost = normalizeHost(readHeader(headers, "x-forwarded-host"));
  const host =
    forwardedHost ?? normalizeHost(readHeader(headers, "host"));
  if (!host) {
    return null;
  }

  const protocol =
    normalizeProtocol(readHeader(headers, "x-forwarded-proto")) ??
    normalizeProtocol(readHeader(headers, "x-forwarded-protocol")) ??
    "https";

  return normalizeOrigin(`${protocol}://${host}`);
}

/**
 * Single source of truth for public origin resolution.
 * Accepts the raw request headers; returns the best-effort site origin.
 */
export function resolveOriginFromHeaders(
  headers: HeaderRecord | null | undefined,
): string {
  return (
    readConfiguredOrigin() ??
    readPlatformOrigin() ??
    readHeaderOrigin(headers) ??
    LOCAL_SITE_ORIGIN
  );
}

/**
 * Synchronous variant. Resolves from env / platform env only;
 * without a request context, header probing is not possible.
 *
 * Prefer `resolveOriginFromHeaders(await headers())` in RSC / generateMetadata.
 */
export function resolveSiteOrigin() {
  return (
    readConfiguredOrigin() ??
    readPlatformOrigin() ??
    LOCAL_SITE_ORIGIN
  );
}

export function resolvePublicOrigin(request: Request) {
  return resolveOriginFromHeaders(request.headers);
}

export function resolvePublicRequestUrl(request: Request) {
  const requestUrl = new URL(request.url);
  return `${resolvePublicOrigin(request)}${requestUrl.pathname}${requestUrl.search}`;
}
