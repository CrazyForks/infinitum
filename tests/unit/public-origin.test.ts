import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = [
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "URL",
  "DEPLOY_PRIME_URL",
  "DEPLOY_URL",
  "CF_PAGES_URL",
  "RAILWAY_PUBLIC_DOMAIN",
  "RENDER_EXTERNAL_URL",
];

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("resolveOriginFromHeaders", () => {
  beforeEach(() => {
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  it("prefers explicit SITE_URL over platform env and request headers", async () => {
    process.env.SITE_URL = "https://configured.example.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "vercel.example.com";
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({
      host: "host.example.com",
      "x-forwarded-host": "xfh.example.com",
    });
    expect(resolveOriginFromHeaders(headers)).toBe("https://configured.example.com");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when SITE_URL is unset", async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "my-app.vercel.app";
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({ host: "ignored.example.com" });
    expect(resolveOriginFromHeaders(headers)).toBe("https://my-app.vercel.app");
  });

  it("falls back to Netlify URL when no Vercel env is present", async () => {
    process.env.URL = "https://my-site.netlify.app";
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({ host: "ignored.example.com" });
    expect(resolveOriginFromHeaders(headers)).toBe("https://my-site.netlify.app");
  });

  it("falls back to Cloudflare Pages env when no Vercel/Netlify env is present", async () => {
    process.env.CF_PAGES_URL = "https://my-project.pages.dev";
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    expect(resolveOriginFromHeaders(null)).toBe("https://my-project.pages.dev");
  });

  it("falls back to X-Forwarded-Host when no env is set", async () => {
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({
      "x-forwarded-host": "real.example.com",
      "x-forwarded-proto": "https",
    });
    expect(resolveOriginFromHeaders(headers)).toBe("https://real.example.com");
  });

  it("falls back to Host header when no X-Forwarded-Host is set", async () => {
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({ host: "real.example.com" });
    expect(resolveOriginFromHeaders(headers)).toBe("https://real.example.com");
  });

  it("respects x-forwarded-proto=http", async () => {
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({
      "x-forwarded-host": "real.example.com",
      "x-forwarded-proto": "http",
    });
    expect(resolveOriginFromHeaders(headers)).toBe("http://real.example.com");
  });

  it("falls back to localhost when no signal is available", async () => {
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    expect(resolveOriginFromHeaders(null)).toBe("http://localhost:3000");
    expect(resolveOriginFromHeaders(new Headers())).toBe("http://localhost:3000");
  });

  it("ignores malformed X-Forwarded-Host", async () => {
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");
    const headers = new Headers({
      "x-forwarded-host": "bad host with spaces",
    });
    expect(resolveOriginFromHeaders(headers)).toBe("http://localhost:3000");
  });
});

describe("resolveSiteOrigin (sync)", () => {
  beforeEach(() => {
    clearEnv();
  });
  afterEach(() => {
    clearEnv();
  });

  it("returns SITE_URL when set", async () => {
    process.env.SITE_URL = "https://configured.example.com";
    const { resolveSiteOrigin } = await import("@/lib/http/public-origin");
    expect(resolveSiteOrigin()).toBe("https://configured.example.com");
  });

  it("falls back to platform env when SITE_URL is missing", async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "my-app.vercel.app";
    const { resolveSiteOrigin } = await import("@/lib/http/public-origin");
    expect(resolveSiteOrigin()).toBe("https://my-app.vercel.app");
  });

  it("falls back to localhost when nothing is available", async () => {
    const { resolveSiteOrigin } = await import("@/lib/http/public-origin");
    expect(resolveSiteOrigin()).toBe("http://localhost:3000");
  });
});
