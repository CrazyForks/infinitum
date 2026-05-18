export async function register() {
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { configureFetchProxyFromEnv } = await import("@/lib/http/proxy");
    configureFetchProxyFromEnv();
  }
}
