const PUBLIC_SITE_URL_ENV_KEYS = [
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PUBLIC_SITE_URL",
] as const;

const LOCAL_SITE_ORIGIN = "http://localhost:3000";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
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

export function resolveConfiguredPublicOrigin() {
  for (const key of PUBLIC_SITE_URL_ENV_KEYS) {
    const configuredOrigin = normalizeOrigin(process.env[key]);
    if (configuredOrigin) {
      return configuredOrigin;
    }
  }

  return null;
}

export function resolveSiteOrigin() {
  return resolveConfiguredPublicOrigin() ?? LOCAL_SITE_ORIGIN;
}

export function resolvePublicOrigin(request: Request) {
  const configuredOrigin = resolveConfiguredPublicOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = normalizeHost(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? normalizeHost(request.headers.get("host")) ?? requestUrl.host;
  const protocol = normalizeProtocol(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.replace(/:$/, "");

  return normalizeOrigin(`${protocol}://${host}`) ?? requestUrl.origin;
}

export function resolvePublicRequestUrl(request: Request) {
  const requestUrl = new URL(request.url);
  return `${resolvePublicOrigin(request)}${requestUrl.pathname}${requestUrl.search}`;
}
